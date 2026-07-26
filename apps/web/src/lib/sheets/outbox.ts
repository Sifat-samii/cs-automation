import { Prisma, type DbClient, type PrismaClient } from "@cs/db";
import {
  projectOrderToSheetRow,
  type SheetMirrorPayload,
  sheetRowValues,
} from "@/lib/sheets/project";

export class SheetMirrorStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetMirrorStateError";
  }
}

type ClaimedMirrorId = { id: string };

export type MirrorClaim = {
  id: string;
  orderId: string;
  operation: "UPSERT";
  orderCode: string;
  placementGroup: string;
  blankRowAfter: boolean;
  matchColumn: "Order Name";
  row: ReturnType<typeof sheetRowValues>;
  status: "CLAIMED";
};

function asPayload(value: unknown): SheetMirrorPayload {
  if (!value || typeof value !== "object") {
    throw new SheetMirrorStateError("Sheet mirror payload is missing");
  }
  const record = value as Record<string, unknown>;
  for (const key of ["Date", "Client", "Order Name", "Quantity", "orderCode", "placementGroup"]) {
    if (typeof record[key] !== "string") {
      throw new SheetMirrorStateError(`Sheet mirror payload field ${key} is invalid`);
    }
  }
  return {
    Date: record.Date as string,
    Client: record.Client as string,
    "Order Name": record["Order Name"] as string,
    Quantity: record.Quantity as string,
    orderCode: record.orderCode as string,
    placementGroup: record.placementGroup as string,
  };
}

export async function enqueueSheetMirror(
  db: DbClient,
  input: { orderId: string; correlationId: string },
): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      code: true,
      title: true,
      quantity: true,
      createdAt: true,
      clientId: true,
      client: { select: { displayName: true } },
    },
  });
  if (!order) {
    throw new SheetMirrorStateError("Order does not exist for sheet mirror enqueue");
  }

  const payload = projectOrderToSheetRow({
    title: order.title,
    quantity: order.quantity,
    createdAt: order.createdAt,
    clientDisplayName: order.client.displayName,
    orderCode: order.code,
    clientId: order.clientId,
  });

  await db.sheetMirrorOutbox.create({
    data: {
      orderId: order.id,
      operation: "UPSERT",
      payload,
      status: "PENDING",
    },
  });
}

export async function claimPendingMirror(
  db: PrismaClient,
  limit: number = 50,
): Promise<MirrorClaim[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Sheet mirror pending limit must be between 1 and 100");
  }

  return db.$transaction(async (transaction) => {
    const claimedIds = await transaction.$queryRaw<ClaimedMirrorId[]>(Prisma.sql`
      SELECT "id"
      FROM "SheetMirrorOutbox"
      WHERE "status" = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    if (claimedIds.length === 0) return [];

    const rows = await transaction.sheetMirrorOutbox.findMany({
      where: { id: { in: claimedIds.map(({ id }) => id) } },
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const ordered = claimedIds
      .map(({ id }) => rowsById.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const claims: MirrorClaim[] = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index]!;
      const payload = asPayload(row.payload);
      const next = ordered[index + 1];
      const nextPayload = next ? asPayload(next.payload) : null;
      const blankRowAfter = !nextPayload || nextPayload.placementGroup !== payload.placementGroup;

      await transaction.sheetMirrorOutbox.update({
        where: { id: row.id },
        data: {
          status: "CLAIMED",
          attempts: { increment: 1 },
          dispatchedAt: new Date(),
          lastError: null,
        },
      });

      claims.push({
        id: row.id,
        orderId: row.orderId,
        operation: "UPSERT",
        orderCode: payload.orderCode,
        placementGroup: payload.placementGroup,
        blankRowAfter,
        matchColumn: "Order Name",
        row: sheetRowValues(payload),
        status: "CLAIMED",
      });
    }
    return claims;
  });
}

export async function markMirrorDone(
  db: PrismaClient,
  input: { id: string; providerRowKey: string },
) {
  const providerRowKey = input.providerRowKey.trim();
  if (!providerRowKey) {
    throw new SheetMirrorStateError("providerRowKey is required");
  }

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "SheetMirrorOutbox"
      WHERE "id" = ${input.id}::uuid
      FOR UPDATE
    `;
    const row = await transaction.sheetMirrorOutbox.findUnique({ where: { id: input.id } });
    if (!row) throw new SheetMirrorStateError("Sheet mirror outbox row does not exist");
    if (row.status === "DONE") {
      if (row.providerRowKey && row.providerRowKey !== providerRowKey) {
        throw new SheetMirrorStateError(
          "Sheet mirror outbox was already completed with another provider row key",
        );
      }
      if (!row.providerRowKey) {
        return transaction.sheetMirrorOutbox.update({
          where: { id: row.id },
          data: { providerRowKey },
        });
      }
      return row;
    }
    if (row.status !== "CLAIMED") {
      throw new SheetMirrorStateError(`Cannot mark sheet mirror done from ${row.status}`);
    }
    return transaction.sheetMirrorOutbox.update({
      where: { id: row.id },
      data: {
        status: "DONE",
        providerRowKey,
        lastError: null,
      },
    });
  });
}
