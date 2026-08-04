import { randomUUID } from "node:crypto";
import { Prisma, type DbClient, type OutboundTemplate, type PrismaClient } from "@cs/db";
import { recordAudit } from "@/lib/audit";
import { isCommunicationPaused } from "@/lib/outbound/pause";
import {
  clampOutboundCopy,
  containsGateBlockedPlaceholder,
  plainTextToEmailHtml,
  renderOutboundTemplate,
  type TemplateContext,
} from "@/lib/outbound/templates";

export const SYSTEM_AUTO_OUTBOUND_ACTOR = "system:auto-outbound";

export class OutboundStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundStateError";
  }
}

export class OutboundCopyGateError extends OutboundStateError {
  constructor() {
    super("Outbound email copy is not approved; placeholder text cannot be approved");
    this.name = "OutboundCopyGateError";
  }
}

export class OutboundPausedError extends OutboundStateError {
  constructor() {
    super("Client communication is paused for this thread");
    this.name = "OutboundPausedError";
  }
}

export type DraftOutboundInput = {
  orderId: string;
  template: OutboundTemplate;
  idempotencyKey: string;
  gmailThreadId?: string;
};

export type DraftSystemOutboundInput = {
  template: OutboundTemplate;
  idempotencyKey: string;
  gmailThreadId: string;
  orderId?: string;
  emailMessageId?: string;
  context?: TemplateContext;
  rendered?: { subject: string; body: string };
  bodySource?: "TEMPLATE" | "AI";
  aiModel?: string;
  now?: Date;
  /** When true, skip the pause check (caller already verified). */
  ignorePause?: boolean;
};

function resolveRenderedCopy(input: DraftSystemOutboundInput): {
  subject: string;
  body: string;
  bodySource: "TEMPLATE" | "AI";
} {
  if (input.rendered) {
    const clamped = clampOutboundCopy(input.rendered.subject, input.rendered.body);
    const bodyLooksHtml = /<[a-z][\s\S]*>/iu.test(clamped.body);
    return {
      subject: clamped.subject,
      body: bodyLooksHtml ? clamped.body : plainTextToEmailHtml(clamped.body),
      bodySource: input.bodySource ?? "AI",
    };
  }
  if (!input.context) {
    throw new Error("System outbound draft requires context or rendered copy");
  }
  const rendered = renderOutboundTemplate(input.template, input.context);
  const clamped = clampOutboundCopy(rendered.subject, rendered.body);
  return {
    subject: clamped.subject,
    body: clamped.body,
    bodySource: input.bodySource ?? "TEMPLATE",
  };
}

export async function draftOutboundEmail(db: DbClient, input: DraftOutboundInput) {
  const existing = await db.outboundEmail.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return existing;

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    include: { client: true },
  });
  if (!order) throw new Error("Outbound order does not exist");
  const gmailThreadId = input.gmailThreadId ?? order.gmailThreadId;
  if (!gmailThreadId) throw new Error("Outbound email requires a Gmail thread");

  const rendered = renderOutboundTemplate(input.template, {
    orderCode: order.code,
    clientDisplayName: order.client.displayName,
    title: order.title,
    ...(order.eta ? { eta: order.eta.toISOString() } : {}),
    ...(order.etaNote ? { etaNote: order.etaNote } : {}),
  });
  return db.outboundEmail.create({
    data: {
      orderId: order.id,
      template: input.template,
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      bodySource: "TEMPLATE",
      idempotencyKey: input.idempotencyKey,
      gmailThreadId,
    },
  });
}

export async function draftAndSystemApproveOutbound(db: DbClient, input: DraftSystemOutboundInput) {
  const now = input.now ?? new Date();
  if (
    !input.ignorePause &&
    (await isCommunicationPaused(db, { gmailThreadId: input.gmailThreadId }))
  ) {
    throw new OutboundPausedError();
  }

  const existing = await db.outboundEmail.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (
      existing.status === "APPROVED" ||
      existing.status === "SENDING" ||
      existing.status === "SENT"
    ) {
      return existing;
    }
    if (containsGateBlockedPlaceholder(existing.renderedSubject, existing.renderedBody)) {
      throw new OutboundCopyGateError();
    }
    return db.outboundEmail.update({
      where: { id: existing.id },
      data: {
        status: "APPROVED",
        approvedById: null,
        approvedAt: existing.approvedAt ?? now,
        lastError: null,
      },
    });
  }

  const resolved = resolveRenderedCopy(input);
  if (containsGateBlockedPlaceholder(resolved.subject, resolved.body)) {
    throw new OutboundCopyGateError();
  }

  const created = await db.outboundEmail.create({
    data: {
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.emailMessageId ? { emailMessageId: input.emailMessageId } : {}),
      template: input.template,
      renderedSubject: resolved.subject,
      renderedBody: resolved.body,
      bodySource: resolved.bodySource,
      ...(input.aiModel ? { aiModel: input.aiModel } : {}),
      status: "APPROVED",
      approvedById: null,
      approvedAt: now,
      idempotencyKey: input.idempotencyKey,
      gmailThreadId: input.gmailThreadId,
    },
  });
  await recordAudit(db, {
    correlationId: randomUUID(),
    actorUserId: null,
    actorLabel: SYSTEM_AUTO_OUTBOUND_ACTOR,
    action: "outbound.system_approved",
    entityType: "OutboundEmail",
    entityId: created.id,
    metadata: {
      template: input.template,
      orderId: input.orderId ?? null,
      emailMessageId: input.emailMessageId ?? null,
      bodySource: resolved.bodySource,
      aiModel: input.aiModel ?? null,
    },
  });
  return created;
}

export async function approveOutboundEmail(
  db: PrismaClient,
  input: { outboundEmailId: string; approvedById: string; now?: Date },
) {
  const now = input.now ?? new Date();
  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "OutboundEmail"
      WHERE "id" = ${input.outboundEmailId}::uuid
      FOR UPDATE
    `;
    const outbound = await transaction.outboundEmail.findUnique({
      where: { id: input.outboundEmailId },
      include: { order: { include: { client: true } } },
    });
    if (!outbound) throw new OutboundStateError("Outbound email does not exist");
    if (outbound.status === "APPROVED") return outbound;
    if (outbound.status !== "DRAFT") {
      throw new OutboundStateError(`Cannot approve outbound email from ${outbound.status}`);
    }
    if (!outbound.order) {
      throw new OutboundStateError("Human approval requires an order-linked outbound email");
    }
    if (await isCommunicationPaused(transaction, { gmailThreadId: outbound.gmailThreadId })) {
      throw new OutboundPausedError();
    }
    const rendered = renderOutboundTemplate(outbound.template, {
      orderCode: outbound.order.code,
      clientDisplayName: outbound.order.client.displayName,
      title: outbound.order.title,
      ...(outbound.order.eta ? { eta: outbound.order.eta.toISOString() } : {}),
      ...(outbound.order.etaNote ? { etaNote: outbound.order.etaNote } : {}),
    });
    if (containsGateBlockedPlaceholder(rendered.subject, rendered.body)) {
      throw new OutboundCopyGateError();
    }

    return transaction.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: "APPROVED",
        approvedById: input.approvedById,
        approvedAt: now,
        renderedSubject: rendered.subject,
        renderedBody: rendered.body,
        lastError: null,
      },
    });
  });
}

type ClaimedOutboundId = {
  id: string;
};

export async function claimPendingOutbound(db: PrismaClient, limit: number = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Outbound pending limit must be between 1 and 100");
  }
  return db.$transaction(async (transaction) => {
    const claimedIds = await transaction.$queryRaw<ClaimedOutboundId[]>(Prisma.sql`
      SELECT "id"
      FROM "OutboundEmail"
      WHERE "status" = 'APPROVED'
        AND "approvedAt" IS NOT NULL
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    if (claimedIds.length === 0) return [];

    const rows = await transaction.outboundEmail.findMany({
      where: { id: { in: claimedIds.map(({ id }) => id) } },
      include: {
        emailMessage: {
          select: { fromAddress: true, gmailThreadId: true },
        },
        order: {
          include: {
            emailMessages: {
              where: { direction: "INBOUND" },
              orderBy: { receivedAt: "desc" },
              select: { gmailThreadId: true, fromAddress: true },
            },
          },
        },
      },
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const ready: Array<{
      id: string;
      template: OutboundTemplate;
      toAddress: string;
      renderedSubject: string;
      renderedBody: string;
      gmailThreadId: string;
      idempotencyKey: string;
      approvedAt: string;
      status: "SENDING";
    }> = [];

    for (const { id } of claimedIds) {
      const row = rowsById.get(id);
      if (!row) continue;

      if (await isCommunicationPaused(transaction, { gmailThreadId: row.gmailThreadId })) {
        // Leave APPROVED so send resumes after Pause/Resume.
        continue;
      }

      let toAddress: string | null = null;
      if (row.emailMessage && row.emailMessage.gmailThreadId === row.gmailThreadId) {
        toAddress = row.emailMessage.fromAddress;
      } else if (row.order) {
        const threadMessage = row.order.emailMessages.find(
          (message) => message.gmailThreadId === row.gmailThreadId,
        );
        toAddress = threadMessage?.fromAddress ?? null;
      }

      if (!toAddress) {
        await transaction.outboundEmail.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            lastError: "No inbound recipient exists for this Gmail thread",
          },
        });
        continue;
      }
      if (containsGateBlockedPlaceholder(row.renderedSubject, row.renderedBody)) {
        await transaction.outboundEmail.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            lastError: "Gate-blocked placeholder reached the outbound queue",
          },
        });
        continue;
      }

      await transaction.outboundEmail.update({
        where: { id: row.id },
        data: { status: "SENDING", lastError: null },
      });
      ready.push({
        id: row.id,
        template: row.template,
        toAddress,
        renderedSubject: row.renderedSubject,
        renderedBody: row.renderedBody,
        gmailThreadId: row.gmailThreadId,
        idempotencyKey: row.idempotencyKey,
        approvedAt: row.approvedAt?.toISOString() ?? "",
        status: "SENDING",
      });
    }
    return ready;
  });
}

export async function markOutboundSent(
  db: PrismaClient,
  input: { outboundEmailId: string; sentMessageId: string },
) {
  const sentMessageId = input.sentMessageId.trim();
  if (!sentMessageId) throw new OutboundStateError("Sent message id is required");

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "OutboundEmail"
      WHERE "id" = ${input.outboundEmailId}::uuid
      FOR UPDATE
    `;
    const outbound = await transaction.outboundEmail.findUnique({
      where: { id: input.outboundEmailId },
    });
    if (!outbound) throw new OutboundStateError("Outbound email does not exist");
    if (outbound.status === "SENT") {
      if (outbound.sentMessageId !== sentMessageId) {
        throw new OutboundStateError("Outbound email was already sent with another message id");
      }
      return outbound;
    }
    if (outbound.status !== "SENDING") {
      throw new OutboundStateError(`Cannot mark outbound email sent from ${outbound.status}`);
    }
    if (!outbound.approvedAt) {
      throw new OutboundStateError("Outbound email has no recorded approval");
    }

    const sent = await transaction.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: "SENT",
        sentMessageId,
        lastError: null,
      },
    });

    // Receipt ack may re-ensure download is queued once the order already exists.
    if (outbound.template === "RECEIPT_ACKNOWLEDGEMENT" && outbound.emailMessageId) {
      const message = await transaction.emailMessage.findUnique({
        where: { id: outbound.emailMessageId },
        select: { orderId: true },
      });
      if (message?.orderId) {
        const batch = await transaction.orderBatch.findFirst({
          where: {
            orderId: message.orderId,
            sequence: 1,
            status: { in: ["PENDING", "FAILED"] },
            sourceLinks: { some: {} },
          },
          select: { id: true },
        });
        if (batch) {
          const { queueBatchTransfer } = await import("@/lib/agent/pipeline");
          await queueBatchTransfer(transaction, {
            batchId: batch.id,
            correlationId: randomUUID(),
          });
        }
      }
    }
    return sent;
  });
}

/** Return a transport-failed SENDING row to APPROVED so n8n can safely retry. */
export async function requeueOutboundAfterTransportFailure(
  db: PrismaClient,
  input: { outboundEmailId: string; error: string },
) {
  const error = input.error.trim().slice(0, 2_000);
  if (!error) throw new OutboundStateError("Transport failure error is required");

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "OutboundEmail"
      WHERE "id" = ${input.outboundEmailId}::uuid
      FOR UPDATE
    `;
    const outbound = await transaction.outboundEmail.findUnique({
      where: { id: input.outboundEmailId },
    });
    if (!outbound) throw new OutboundStateError("Outbound email does not exist");
    if (outbound.status === "APPROVED") return outbound;
    if (outbound.status !== "SENDING") {
      throw new OutboundStateError(`Cannot requeue outbound email from ${outbound.status}`);
    }
    if (outbound.sentMessageId) {
      throw new OutboundStateError("Outbound email already has a provider message id");
    }
    if (!outbound.approvedAt) {
      throw new OutboundStateError("Outbound email has no recorded approval");
    }

    return transaction.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: "APPROVED",
        lastError: error,
      },
    });
  });
}
