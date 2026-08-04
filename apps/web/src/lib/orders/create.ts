import { Prisma, type DbClient, type PrismaClient } from "@cs/db";
import { assertPathBudget, buildOrderCode, buildOrderFolderName, joinUncPath } from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import { queueBatchTransfer } from "@/lib/agent/pipeline";
import { enqueueSheetMirror } from "@/lib/sheets/outbox";

const MAX_SEQUENCE_RETRIES = 3;
const LONGEST_EXPECTED_FILE_NAME = `${"f".repeat(60)}.tif`;
const INITIAL_BATCH_SUBFOLDER = "01_INITIAL";

export type OrderMutationActor = {
  userId: string;
  label: string;
};

export type SourceLinkInput = {
  kind: "DROPBOX" | "GDRIVE" | "ATTACHMENT" | "MANUAL_DROP" | "OTHER";
  url?: string;
  localHint?: string;
};

export type CreateOrderInput = {
  clientId: string;
  title: string;
  orderType: string;
  quantity?: number;
  sourceLinks?: readonly SourceLinkInput[];
  actor: OrderMutationActor;
  correlationId: string;
  createdAt?: Date;
  backupRoot: string;
  productionRoot: string;
};

function requiredTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function normaliseQuantity(quantity: number | undefined): number | undefined {
  if (quantity === undefined) return undefined;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Order quantity must be a positive integer");
  }
  return quantity;
}

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

function sequenceFromCode(code: string): number {
  const sequence = Number.parseInt(code.slice(-3), 10);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error(`Stored order code has an invalid sequence: ${code}`);
  }
  return sequence;
}

function isOrderCodeCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.some((field) => field === "code")
    : String(target).toLowerCase().includes("code");
}

export async function createOrderInTransaction(db: DbClient, input: CreateOrderInput) {
  const title = requiredTrimmed(input.title, "Order title");
  const orderType = requiredTrimmed(input.orderType, "Order type");
  const quantity = normaliseQuantity(input.quantity);
  const createdAt = input.createdAt ?? new Date();
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Order creation date must be valid");
  }
  const sourceLinks = (input.sourceLinks ?? []).map((source) =>
    normaliseSourceLink(source, input.actor.userId),
  );

  const client = await db.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, code: true, folderName: true, isActive: true },
  });
  if (!client?.isActive) {
    throw new Error("Order client does not exist or is inactive");
  }

  const firstCode = buildOrderCode(client.code, createdAt, 1);
  const codePrefix = firstCode.slice(0, -3);
  const latestOrder = await db.order.findFirst({
    where: {
      clientId: client.id,
      code: { startsWith: codePrefix },
    },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const sequence = latestOrder ? sequenceFromCode(latestOrder.code) + 1 : 1;
  const code = buildOrderCode(client.code, createdAt, sequence);
  const folderName = buildOrderFolderName(code, title);

  const budgetSegments = [client.folderName, folderName, INITIAL_BATCH_SUBFOLDER] as const;
  assertPathBudget(input.backupRoot, budgetSegments, LONGEST_EXPECTED_FILE_NAME);
  assertPathBudget(input.productionRoot, budgetSegments, LONGEST_EXPECTED_FILE_NAME);

  const backupPath = joinUncPath(input.backupRoot, client.folderName, folderName);
  const productionPath = joinUncPath(input.productionRoot, client.folderName, folderName);
  const order = await db.order.create({
    data: {
      code,
      clientId: client.id,
      title,
      orderType,
      ...(quantity !== undefined ? { quantity } : {}),
      folderName,
      backupPath,
      productionPath,
      createdById: input.actor.userId,
      createdAt,
    },
  });

  const batch = await db.orderBatch.create({
    data: {
      orderId: order.id,
      sequence: 1,
      kind: "INITIAL",
      subfolder: INITIAL_BATCH_SUBFOLDER,
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
      type: "order.created",
      payload: { code, status: "UNASSIGNED" },
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      correlationId: input.correlationId,
    },
  });
  await recordAudit(db, {
    correlationId: input.correlationId,
    actorUserId: input.actor.userId,
    actorLabel: input.actor.label,
    action: "order.created",
    entityType: "Order",
    entityId: order.id,
    metadata: { code, clientId: client.id, batchId: batch.id },
  });
  await enqueueSheetMirror(db, {
    orderId: order.id,
    correlationId: input.correlationId,
  });

  if (sourceLinks.length > 0) {
    await queueBatchTransfer(db, {
      batchId: batch.id,
      correlationId: input.correlationId,
    });
  }

  return order;
}

export async function createOrder(db: PrismaClient, input: CreateOrderInput) {
  for (let retry = 0; retry <= MAX_SEQUENCE_RETRIES; retry += 1) {
    try {
      return await db.$transaction((transaction) => createOrderInTransaction(transaction, input));
    } catch (error) {
      if (retry < MAX_SEQUENCE_RETRIES && isOrderCodeCollision(error)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Order sequence allocation exhausted");
}
