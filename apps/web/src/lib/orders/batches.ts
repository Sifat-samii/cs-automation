import { Prisma, type DbClient, type PrismaClient } from "@cs/db";
import { recordAudit } from "@/lib/audit";
import type { OrderMutationActor, SourceLinkInput } from "@/lib/orders/create";

const MAX_SEQUENCE_RETRIES = 3;

export type AddBatchInput = {
  orderId: string;
  kind: "ADDITIONAL" | "SAMPLE" | "CORRECTION";
  notes?: string;
  sourceLinks?: readonly SourceLinkInput[];
  actor: OrderMutationActor;
  correlationId: string;
};

function normaliseSourceLink(source: SourceLinkInput, actorUserId: string) {
  const url = source.url?.trim();
  const localHint = source.localHint?.trim();
  if (!url && !localHint) {
    throw new Error("A source link requires a URL or local hint");
  }
  return {
    kind: source.kind,
    addedById: actorUserId,
    ...(url ? { url } : {}),
    ...(localHint ? { localHint } : {}),
  };
}

function isBatchSequenceCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target)];
  return fields.some(
    (field) => field.toLowerCase().includes("sequence") || field.toLowerCase().includes("orderid"),
  );
}

export async function addBatchInTransaction(db: DbClient, input: AddBatchInput) {
  const notes = input.notes?.trim();
  const sourceLinks = (input.sourceLinks ?? []).map((source) =>
    normaliseSourceLink(source, input.actor.userId),
  );

  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true },
  });
  if (!order) {
    throw new Error("Order does not exist");
  }
  if (order.status === "CLOSED" || order.status === "CANCELLED") {
    throw new Error(`Cannot add a batch to terminal order ${order.status}`);
  }

  const latestBatch = await db.orderBatch.findFirst({
    where: { orderId: order.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (latestBatch?.sequence ?? 0) + 1;
  const subfolder = `${sequence.toString().padStart(2, "0")}_${input.kind}`;
  const batch = await db.orderBatch.create({
    data: {
      orderId: order.id,
      sequence,
      kind: input.kind,
      subfolder,
      ...(notes ? { notes } : {}),
      createdById: input.actor.userId,
      ...(sourceLinks.length > 0
        ? {
            sourceLinks: {
              create: sourceLinks,
            },
          }
        : {}),
    },
  });

  await db.orderEvent.create({
    data: {
      orderId: order.id,
      batchId: batch.id,
      type: "batch.added",
      payload: {
        sequence,
        kind: input.kind,
        status: "PENDING",
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
    action: "batch.added",
    entityType: "OrderBatch",
    entityId: batch.id,
    metadata: {
      orderId: order.id,
      sequence,
      kind: input.kind,
    },
  });

  return batch;
}

export async function addBatch(db: PrismaClient, input: AddBatchInput) {
  for (let retry = 0; retry <= MAX_SEQUENCE_RETRIES; retry += 1) {
    try {
      return await db.$transaction((transaction) => addBatchInTransaction(transaction, input));
    } catch (error) {
      if (retry < MAX_SEQUENCE_RETRIES && isBatchSequenceCollision(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Batch sequence allocation exhausted");
}
