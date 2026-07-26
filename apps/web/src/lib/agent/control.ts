import { Prisma, type PrismaClient } from "@cs/db";
import { assertBatchTransition } from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import type { OrderMutationActor } from "@/lib/orders/create";

type ControlInput = {
  batchId: string;
  correlationId: string;
  actor: OrderMutationActor;
};

async function resetDownloadJob(
  transaction: Prisma.TransactionClient,
  batchId: string,
  correlationId: string,
) {
  return transaction.transferJob.upsert({
    where: { batchId_kind: { batchId, kind: "DOWNLOAD" } },
    create: { batchId, kind: "DOWNLOAD", correlationId },
    update: {
      status: "QUEUED",
      attempts: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      errorClass: null,
      bytesDone: 0,
      bytesTotal: 0,
      correlationId,
    },
  });
}

async function recordControl(
  transaction: Prisma.TransactionClient,
  input: ControlInput & {
    orderId: string;
    type: string;
    metadata?: Prisma.InputJsonObject;
  },
): Promise<void> {
  await transaction.orderEvent.create({
    data: {
      orderId: input.orderId,
      batchId: input.batchId,
      type: input.type,
      payload: input.metadata ?? {},
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      correlationId: input.correlationId,
    },
  });
  await recordAudit(transaction, {
    correlationId: input.correlationId,
    actorUserId: input.actor.userId,
    actorLabel: input.actor.label,
    action: input.type,
    entityType: "OrderBatch",
    entityId: input.batchId,
    metadata: input.metadata,
  });
}

export async function startBatchTransfer(db: PrismaClient, input: ControlInput): Promise<void> {
  await db.$transaction(async (transaction) => {
    const batch = await transaction.orderBatch.findUnique({
      where: { id: input.batchId },
      include: { transferJobs: { select: { id: true } } },
    });
    if (!batch || batch.status !== "PENDING" || batch.transferJobs.length > 0) {
      throw new Error("Only a new pending batch can be started");
    }
    await resetDownloadJob(transaction, batch.id, input.correlationId);
    await recordControl(transaction, {
      ...input,
      orderId: batch.orderId,
      type: "transfer.queued",
    });
  });
}

export async function retryBatchTransfer(db: PrismaClient, input: ControlInput): Promise<void> {
  await db.$transaction(async (transaction) => {
    const batch = await transaction.orderBatch.findUnique({ where: { id: input.batchId } });
    if (!batch || batch.status !== "FAILED") {
      throw new Error("Only a failed batch can be retried");
    }
    assertBatchTransition("FAILED", "PENDING");
    await transaction.orderBatch.update({
      where: { id: batch.id },
      data: { status: "PENDING", failureReason: null },
    });
    await resetDownloadJob(transaction, batch.id, input.correlationId);
    await recordControl(transaction, {
      ...input,
      orderId: batch.orderId,
      type: "transfer.retry_queued",
    });
  });
}

export async function confirmManualDropAndRetry(
  db: PrismaClient,
  input: ControlInput & { stagingRoot: string },
): Promise<void> {
  await db.$transaction(async (transaction) => {
    const batch = await transaction.orderBatch.findUnique({
      where: { id: input.batchId },
      include: {
        transferJobs: {
          where: {
            kind: "DOWNLOAD",
            status: "FAILED",
            errorClass: "PERMANENT",
          },
        },
        sourceLinks: { where: { kind: "MANUAL_DROP" }, take: 1 },
      },
    });
    if (!batch || batch.status !== "FAILED" || batch.transferJobs.length === 0) {
      throw new Error("Manual drop is available only after a permanent download failure");
    }

    if (batch.sourceLinks.length === 0) {
      await transaction.sourceLink.create({
        data: {
          batchId: batch.id,
          kind: "MANUAL_DROP",
          localHint: `${input.stagingRoot}\\manual\\${batch.id}`,
          addedById: input.actor.userId,
        },
      });
    }
    assertBatchTransition("FAILED", "PENDING");
    await transaction.orderBatch.update({
      where: { id: batch.id },
      data: {
        status: "PENDING",
        failureReason: null,
        manualDropConfirmedAt: new Date(),
        manualDropConfirmedById: input.actor.userId,
      },
    });
    await resetDownloadJob(transaction, batch.id, input.correlationId);
    await recordControl(transaction, {
      ...input,
      orderId: batch.orderId,
      type: "transfer.manual_drop_confirmed",
      metadata: { priorFailureClass: "PERMANENT" },
    });
  });
}
