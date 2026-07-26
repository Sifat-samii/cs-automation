import type { DbClient } from "@cs/db";
import { assertOrderTransition } from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import { draftAndSystemApproveOutbound, draftOutboundEmail } from "@/lib/outbound/service";

export async function handleBatchVerified(
  db: DbClient,
  input: { batchId: string; correlationId: string },
) {
  const batch = await db.orderBatch.findUnique({
    where: { id: input.batchId },
    include: { order: { include: { client: true } } },
  });
  if (!batch) throw new Error("Verified outbound hook batch does not exist");
  if (batch.status !== "VERIFIED") {
    throw new Error("Files-verified outbound hook requires a verified batch");
  }
  if (!batch.order.gmailThreadId) {
    return { outboundEmailId: null, transitionedToAwaitingEta: false };
  }

  const etaNote = batch.order.eta
    ? `Current ETA: ${batch.order.eta.toISOString()}.`
    : (batch.order.etaNote ?? "");

  const outbound = await draftAndSystemApproveOutbound(db, {
    orderId: batch.orderId,
    template: "FILES_VERIFIED",
    idempotencyKey: `files-verified:${batch.id}`,
    gmailThreadId: batch.order.gmailThreadId,
    context: {
      orderCode: batch.order.code,
      clientDisplayName: batch.order.client.displayName,
      title: batch.order.title,
      ...(batch.order.eta ? { eta: batch.order.eta.toISOString() } : {}),
      ...(etaNote ? { etaNote } : {}),
    },
  });

  let transitionedToAwaitingEta = false;
  if (!batch.order.eta && batch.order.status === "ACKNOWLEDGED") {
    assertOrderTransition(batch.order.status, "AWAITING_ETA");
    const updated = await db.order.updateMany({
      where: { id: batch.orderId, status: "ACKNOWLEDGED", eta: null },
      data: { status: "AWAITING_ETA" },
    });
    if (updated.count === 1) {
      transitionedToAwaitingEta = true;
      await db.orderEvent.create({
        data: {
          orderId: batch.orderId,
          batchId: batch.id,
          type: "order.status_changed",
          payload: {
            from: "ACKNOWLEDGED",
            to: "AWAITING_ETA",
            reason: "files_verified_without_eta",
          },
          actorLabel: "File Agent",
          correlationId: input.correlationId,
        },
      });
      await recordAudit(db, {
        correlationId: input.correlationId,
        actorUserId: null,
        actorLabel: "File Agent",
        action: "order.status_changed",
        entityType: "Order",
        entityId: batch.orderId,
        metadata: {
          from: "ACKNOWLEDGED",
          to: "AWAITING_ETA",
          reason: "files_verified_without_eta",
          batchId: batch.id,
        },
      });
    }
  }

  return { outboundEmailId: outbound.id, transitionedToAwaitingEta };
}

export async function draftEtaNoticeAfterSetEta(
  db: DbClient,
  input: {
    orderId: string;
    previousStatus: string;
    eta: Date;
  },
) {
  if (input.previousStatus !== "AWAITING_ETA") return null;
  return draftOutboundEmail(db, {
    orderId: input.orderId,
    template: "ETA_NOTICE",
    idempotencyKey: `eta:${input.orderId}:${input.eta.toISOString()}`,
  });
}
