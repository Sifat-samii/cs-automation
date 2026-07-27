import type { DbClient } from "@cs/db";
import { draftAndSystemApproveOutbound, OutboundPausedError } from "@/lib/outbound/service";

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
    return { outboundEmailId: null };
  }

  const etaNote = batch.order.eta
    ? `Current ETA: ${batch.order.eta.toISOString()}.`
    : (batch.order.etaNote ?? "");

  try {
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
    return { outboundEmailId: outbound.id };
  } catch (error) {
    if (error instanceof OutboundPausedError) {
      await db.orderEvent.create({
        data: {
          orderId: batch.orderId,
          batchId: batch.id,
          type: "outbound.suppressed_paused",
          payload: { template: "FILES_VERIFIED", reason: "communication_paused" },
          actorLabel: "File Agent",
          correlationId: input.correlationId,
        },
      });
      return { outboundEmailId: null };
    }
    throw error;
  }
}
