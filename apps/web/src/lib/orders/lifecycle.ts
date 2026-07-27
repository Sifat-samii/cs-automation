import type { DbClient, PrismaClient } from "@cs/db";
import {
  assertBatchTransition,
  assertOrderTransition,
  type BatchStatus,
  type OrderStatus,
} from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import type { OrderMutationActor } from "@/lib/orders/create";
import { isCommunicationPaused } from "@/lib/outbound/pause";
import { draftAndSystemApproveOutbound, OutboundPausedError } from "@/lib/outbound/service";
import { enqueueSheetMirror } from "@/lib/sheets/outbox";

type MutationContext = {
  actor: OrderMutationActor;
  correlationId: string;
};

export type SetBatchStatusInput = MutationContext & {
  batchId: string;
  status: BatchStatus;
  failureReason?: string;
};

export type ApproveOrderInput = MutationContext & {
  orderId: string;
  eta?: Date;
  now?: Date;
};

export type SetOrderEtaInput = MutationContext & {
  orderId: string;
  eta: Date;
  reason?: string;
  note?: string;
  now?: Date;
};

export type MarkReadyToUploadInput = MutationContext & {
  orderId: string;
};

export type UpdateOrderDetailsInput = MutationContext & {
  orderId: string;
  title: string;
  orderType: string;
  quantity?: number | null;
  reason: string;
};

export type SendQueryEmailInput = MutationContext & {
  orderId: string;
  queryText: string;
  rendered?: { subject: string; body: string };
  aiModel?: string;
};

async function transitionOrderStatus(
  db: DbClient,
  input: {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    actor: OrderMutationActor;
    correlationId: string;
    extraData?: {
      approvedAt?: Date;
      approvedById?: string;
      eta?: Date;
      etaLockedAt?: Date;
      etaSentAt?: Date;
    };
    eventPayload?: Record<string, unknown>;
  },
) {
  assertOrderTransition(input.from, input.to);
  const result = await db.order.updateMany({
    where: { id: input.orderId, status: input.from },
    data: {
      status: input.to,
      ...(input.extraData ?? {}),
    },
  });
  if (result.count !== 1) {
    throw new Error("Order status changed concurrently; retry the operation");
  }
  await db.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: "order.status_changed",
      payload: {
        from: input.from,
        to: input.to,
        ...(input.eventPayload ?? {}),
      },
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      correlationId: input.correlationId,
    },
  });
  await recordAudit(db, {
    correlationId: input.correlationId,
    actorUserId: input.actor.userId,
    actorLabel: input.actor.label,
    action: "order.status_changed",
    entityType: "Order",
    entityId: input.orderId,
    metadata: {
      from: input.from,
      to: input.to,
      ...(input.eventPayload ?? {}),
    },
  });
}

export async function approveOrder(db: PrismaClient, input: ApproveOrderInput) {
  const now = input.now ?? new Date();
  if (input.eta && (Number.isNaN(input.eta.getTime()) || input.eta.getTime() <= now.getTime())) {
    throw new Error("ETA must be a valid future timestamp");
  }

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "Order"
      WHERE "id" = ${input.orderId}::uuid
      FOR UPDATE
    `;
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      include: { client: true },
    });
    if (!order) throw new Error("Order does not exist");
    if (order.status === "IN_PRODUCTION" || order.status === "READY_TO_UPLOAD") {
      return order;
    }
    if (order.status !== "UNASSIGNED") {
      throw new Error(`Cannot approve order from ${order.status}`);
    }

    const etaIso = input.eta?.toISOString();
    await transitionOrderStatus(transaction, {
      orderId: order.id,
      from: "UNASSIGNED",
      to: "IN_PRODUCTION",
      actor: input.actor,
      correlationId: input.correlationId,
      extraData: {
        approvedAt: now,
        approvedById: input.actor.userId,
        ...(input.eta
          ? {
              eta: input.eta,
              etaLockedAt: now,
              etaSentAt: now,
            }
          : {}),
      },
      eventPayload: {
        reason: input.eta ? "approved_with_eta" : "approved_without_eta",
        ...(etaIso ? { eta: etaIso } : {}),
      },
    });

    const updated = await transaction.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { client: true },
    });

    if (order.gmailThreadId) {
      const paused = await isCommunicationPaused(transaction, {
        gmailThreadId: order.gmailThreadId,
      });
      if (paused) {
        await transaction.orderEvent.create({
          data: {
            orderId: order.id,
            type: "outbound.suppressed_paused",
            payload: { template: "ORDER_CONFIRMATION", reason: "communication_paused" },
            actorUserId: input.actor.userId,
            actorLabel: input.actor.label,
            correlationId: input.correlationId,
          },
        });
      } else {
        try {
          await draftAndSystemApproveOutbound(transaction, {
            orderId: order.id,
            template: "ORDER_CONFIRMATION",
            idempotencyKey: `order-confirmation:${order.id}`,
            gmailThreadId: order.gmailThreadId,
            context: {
              orderCode: updated.code,
              clientDisplayName: updated.client.displayName,
              title: updated.title,
              ...(updated.eta ? { eta: updated.eta.toISOString() } : {}),
              ...(updated.eta
                ? { etaNote: `Estimated delivery date: ${updated.eta.toISOString()}.` }
                : {
                    etaNote:
                      "We will share an estimated delivery date in this thread as soon as it is confirmed.",
                  }),
            },
            ignorePause: true,
          });
        } catch (error) {
          if (!(error instanceof OutboundPausedError)) throw error;
        }
      }
    }

    await enqueueSheetMirror(transaction, {
      orderId: order.id,
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export async function setOrderEta(db: PrismaClient, input: SetOrderEtaInput) {
  const now = input.now ?? new Date();
  if (Number.isNaN(input.eta.getTime()) || input.eta.getTime() <= now.getTime()) {
    throw new Error("ETA must be a valid future timestamp");
  }
  const note = input.note?.trim();
  const reason = input.reason?.trim();

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "Order"
      WHERE "id" = ${input.orderId}::uuid
      FOR UPDATE
    `;
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      include: { client: true },
    });
    if (!order) throw new Error("Order does not exist");
    if (order.status !== "IN_PRODUCTION") {
      throw new Error("ETA can only be set on an in-production order");
    }

    const isChange = order.etaLockedAt !== null;
    if (isChange && (!reason || reason.length < 5)) {
      throw new Error("Changing a locked ETA requires a reason of at least 5 characters");
    }

    const eta = input.eta.toISOString();
    const updated = await transaction.order.update({
      where: { id: order.id },
      data: {
        eta: input.eta,
        etaNote: note ?? null,
        etaLockedAt: order.etaLockedAt ?? now,
        etaSentAt: now,
        ...(isChange ? { etaChangeReason: reason } : {}),
      },
      include: { client: true },
    });

    const eventType = isChange ? "order.eta_changed" : "order.eta_set";
    await transaction.orderEvent.create({
      data: {
        orderId: order.id,
        type: eventType,
        payload: {
          eta,
          ...(note ? { note } : {}),
          ...(isChange && reason ? { reason } : {}),
        },
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        correlationId: input.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: eventType,
      entityType: "Order",
      entityId: order.id,
      metadata: {
        eta,
        ...(note ? { note } : {}),
        ...(isChange && reason ? { reason } : {}),
      },
    });

    if (order.gmailThreadId) {
      const paused = await isCommunicationPaused(transaction, {
        gmailThreadId: order.gmailThreadId,
      });
      if (paused) {
        await transaction.orderEvent.create({
          data: {
            orderId: order.id,
            type: "outbound.suppressed_paused",
            payload: {
              template: isChange ? "ETA_UPDATE" : "ETA_UPDATE",
              reason: "communication_paused",
            },
            actorUserId: input.actor.userId,
            actorLabel: input.actor.label,
            correlationId: input.correlationId,
          },
        });
      } else {
        await draftAndSystemApproveOutbound(transaction, {
          orderId: order.id,
          template: "ETA_UPDATE",
          idempotencyKey: `eta-update:${order.id}:${eta}`,
          gmailThreadId: order.gmailThreadId,
          context: {
            orderCode: updated.code,
            clientDisplayName: updated.client.displayName,
            title: updated.title,
            eta,
            ...(note ? { etaNote: note } : {}),
            etaChangeReason: isChange
              ? (reason ?? "Updated by Client Support")
              : "Initial ETA confirmation",
          },
          ignorePause: true,
        });
      }
    }

    await enqueueSheetMirror(transaction, {
      orderId: order.id,
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export async function markReadyToUpload(db: PrismaClient, input: MarkReadyToUploadInput) {
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "Order"
      WHERE "id" = ${input.orderId}::uuid
      FOR UPDATE
    `;
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true },
    });
    if (!order) throw new Error("Order does not exist");
    if (order.status === "READY_TO_UPLOAD") {
      return transaction.order.findUniqueOrThrow({ where: { id: order.id } });
    }
    if (order.status !== "IN_PRODUCTION") {
      throw new Error("Ready to Upload is only allowed from In Production");
    }

    await transitionOrderStatus(transaction, {
      orderId: order.id,
      from: "IN_PRODUCTION",
      to: "READY_TO_UPLOAD",
      actor: input.actor,
      correlationId: input.correlationId,
      eventPayload: { reason: "ready_to_upload" },
    });

    await enqueueSheetMirror(transaction, {
      orderId: order.id,
      correlationId: input.correlationId,
    });

    return transaction.order.findUniqueOrThrow({ where: { id: order.id } });
  });
}

export async function sendQueryEmail(db: PrismaClient, input: SendQueryEmailInput) {
  const queryText = input.queryText.trim();
  if (queryText.length < 3) throw new Error("Query text is required");

  return db.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      include: { client: true },
    });
    if (!order) throw new Error("Order does not exist");
    if (order.status !== "UNASSIGNED") {
      throw new Error("Query emails are only allowed while the order is unassigned");
    }
    if (!order.gmailThreadId) throw new Error("Order has no Gmail thread for a query reply");

    const paused = await isCommunicationPaused(transaction, {
      gmailThreadId: order.gmailThreadId,
    });
    if (paused) throw new OutboundPausedError();

    const outbound = await draftAndSystemApproveOutbound(transaction, {
      orderId: order.id,
      template: "QUERY_REPLY",
      idempotencyKey: `query:${order.id}:${input.correlationId}`,
      gmailThreadId: order.gmailThreadId,
      ...(input.rendered
        ? { rendered: input.rendered, bodySource: "AI" as const, aiModel: input.aiModel }
        : {
            context: {
              orderCode: order.code,
              clientDisplayName: order.client.displayName,
              title: order.title,
              messageBody: queryText,
            },
          }),
      ignorePause: true,
    });

    await transaction.orderEvent.create({
      data: {
        orderId: order.id,
        type: "order.query_sent",
        payload: {
          outboundEmailId: outbound.id,
          queryLength: queryText.length,
        },
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        correlationId: input.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: "order.query_sent",
      entityType: "Order",
      entityId: order.id,
      metadata: { outboundEmailId: outbound.id },
    });

    return outbound;
  });
}

export async function setBatchStatus(db: PrismaClient, input: SetBatchStatusInput) {
  const failureReason = input.failureReason?.trim();
  return db.$transaction(async (transaction) => {
    const batch = await transaction.orderBatch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        orderId: true,
        status: true,
        _count: { select: { transferJobs: true } },
      },
    });
    if (!batch) {
      throw new Error("Order batch does not exist");
    }
    if (batch._count.transferJobs > 0) {
      throw new Error(
        "Manual batch status changes are disabled after the transfer pipeline is queued",
      );
    }

    assertBatchTransition(batch.status, input.status);
    const result = await transaction.orderBatch.updateMany({
      where: { id: batch.id, status: batch.status },
      data: {
        status: input.status,
        ...(input.status === "FAILED"
          ? { failureReason: failureReason ?? null }
          : input.status === "PENDING"
            ? { failureReason: null }
            : {}),
      },
    });
    if (result.count !== 1) {
      throw new Error("Batch status changed concurrently; retry the operation");
    }
    const updated = await transaction.orderBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });

    await transaction.orderEvent.create({
      data: {
        orderId: batch.orderId,
        batchId: batch.id,
        type: "batch.status_changed",
        payload: {
          from: batch.status,
          to: input.status,
          ...(failureReason ? { failureReason } : {}),
        },
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        correlationId: input.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: "batch.status_changed",
      entityType: "OrderBatch",
      entityId: batch.id,
      metadata: {
        orderId: batch.orderId,
        from: batch.status,
        to: input.status,
        ...(failureReason ? { failureReason } : {}),
      },
    });

    return updated;
  });
}

export async function updateOrderDetails(db: PrismaClient, input: UpdateOrderDetailsInput) {
  const title = input.title.trim();
  const orderType = input.orderType.trim();
  const reason = input.reason.trim();
  if (!title || !orderType) {
    throw new Error("Title and order type are required");
  }
  if (reason.length < 5) {
    throw new Error("Emergency edit requires a reason of at least 5 characters");
  }

  return db.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, title: true, orderType: true, quantity: true },
    });
    if (!order) {
      throw new Error("Order does not exist");
    }
    if (order.status === "READY_TO_UPLOAD") {
      throw new Error("Cannot edit a ready-to-upload order");
    }

    const quantity =
      input.quantity === undefined
        ? order.quantity
        : input.quantity === null
          ? null
          : input.quantity;

    const updated = await transaction.order.update({
      where: { id: order.id },
      data: {
        title,
        orderType,
        quantity,
      },
    });

    await transaction.orderEvent.create({
      data: {
        orderId: order.id,
        type: "order.details_updated",
        payload: {
          reason,
          from: {
            title: order.title,
            orderType: order.orderType,
            quantity: order.quantity?.toString() ?? null,
          },
          to: {
            title,
            orderType,
            quantity: quantity?.toString() ?? null,
          },
        },
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        correlationId: input.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: "order.details_updated",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        reason,
        title,
        orderType,
        quantity: quantity?.toString() ?? null,
      },
    });
    await enqueueSheetMirror(transaction, {
      orderId: order.id,
      correlationId: input.correlationId,
    });

    return updated;
  });
}

/** @deprecated Prefer approveOrder / markReadyToUpload. Kept for transitional callers. */
export async function setOrderStatus(
  db: PrismaClient,
  input: MutationContext & { orderId: string; status: OrderStatus; cancelReason?: string },
) {
  if (input.status === "IN_PRODUCTION") {
    return approveOrder(db, {
      orderId: input.orderId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }
  if (input.status === "READY_TO_UPLOAD") {
    return markReadyToUpload(db, {
      orderId: input.orderId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }
  throw new Error(`Manual transition to ${input.status} is not supported`);
}

/** @deprecated Prefer setOrderEta. */
export async function setEta(
  db: PrismaClient,
  input: MutationContext & { orderId: string; eta: Date; note?: string; now?: Date },
) {
  return setOrderEta(db, {
    orderId: input.orderId,
    eta: input.eta,
    ...(input.note ? { note: input.note } : {}),
    ...(input.now ? { now: input.now } : {}),
    actor: input.actor,
    correlationId: input.correlationId,
  });
}
