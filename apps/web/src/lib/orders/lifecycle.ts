import type { PrismaClient } from "@cs/db";
import {
  assertBatchTransition,
  assertOrderTransition,
  type BatchStatus,
  type OrderStatus,
} from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import type { OrderMutationActor } from "@/lib/orders/create";

type MutationContext = {
  actor: OrderMutationActor;
  correlationId: string;
};

export type SetOrderStatusInput = MutationContext & {
  orderId: string;
  status: OrderStatus;
  cancelReason?: string;
};

export type SetBatchStatusInput = MutationContext & {
  batchId: string;
  status: BatchStatus;
  failureReason?: string;
};

export type SetEtaInput = MutationContext & {
  orderId: string;
  eta: Date;
  note?: string;
  now?: Date;
};

export async function setOrderStatus(db: PrismaClient, input: SetOrderStatusInput) {
  const cancelReason = input.cancelReason?.trim();
  return db.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new Error("Order does not exist");
    }

    assertOrderTransition(order.status, input.status);
    const result = await transaction.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: input.status,
        ...(input.status === "CANCELLED" ? { cancelReason: cancelReason ?? null } : {}),
      },
    });
    if (result.count !== 1) {
      throw new Error("Order status changed concurrently; retry the operation");
    }
    const updated = await transaction.order.findUniqueOrThrow({
      where: { id: order.id },
    });

    await transaction.orderEvent.create({
      data: {
        orderId: order.id,
        type: "order.status_changed",
        payload: {
          from: order.status,
          to: input.status,
          ...(cancelReason ? { cancelReason } : {}),
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
      action: "order.status_changed",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        from: order.status,
        to: input.status,
        ...(cancelReason ? { cancelReason } : {}),
      },
    });

    return updated;
  });
}

export async function setBatchStatus(db: PrismaClient, input: SetBatchStatusInput) {
  const failureReason = input.failureReason?.trim();
  return db.$transaction(async (transaction) => {
    const batch = await transaction.orderBatch.findUnique({
      where: { id: input.batchId },
      select: { id: true, orderId: true, status: true },
    });
    if (!batch) {
      throw new Error("Order batch does not exist");
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

export async function setEta(db: PrismaClient, input: SetEtaInput) {
  const now = input.now ?? new Date();
  if (
    Number.isNaN(input.eta.getTime()) ||
    Number.isNaN(now.getTime()) ||
    input.eta.getTime() <= now.getTime()
  ) {
    throw new Error("ETA must be a valid future timestamp");
  }
  const note = input.note?.trim();

  return db.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new Error("Order does not exist");
    }
    if (order.status === "CLOSED" || order.status === "CANCELLED") {
      throw new Error(`Cannot set ETA on terminal order ${order.status}`);
    }

    const result = await transaction.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        eta: input.eta,
        etaNote: note ?? null,
      },
    });
    if (result.count !== 1) {
      throw new Error("Order status changed concurrently; retry the operation");
    }
    const updated = await transaction.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    const eta = input.eta.toISOString();

    await transaction.orderEvent.create({
      data: {
        orderId: order.id,
        type: "order.eta_set",
        payload: {
          eta,
          ...(note ? { note } : {}),
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
      action: "order.eta_set",
      entityType: "Order",
      entityId: order.id,
      metadata: {
        eta,
        ...(note ? { note } : {}),
      },
    });

    return updated;
  });
}
