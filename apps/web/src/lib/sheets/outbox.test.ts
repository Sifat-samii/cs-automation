import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { parseServerEnv } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createOrder } from "@/lib/orders/create";
import {
  claimPendingMirror,
  enqueueSheetMirror,
  markMirrorDone,
  SheetMirrorStateError,
} from "@/lib/sheets/outbox";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const env = parseServerEnv(process.env);

async function seedClient(displayName = "FN", code = "FN") {
  await prisma.user.create({
    data: {
      id: actor.userId,
      loginId: "2061",
      displayName: actor.label,
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
  return prisma.client.create({
    data: { code, displayName, folderName: code },
  });
}

describe("sheet mirror outbox", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enqueues a PENDING projection inside createOrder", async () => {
    const client = await seedClient();
    const order = await createOrder(prisma, {
      clientId: client.id,
      title: "FN 02-20-26_Zea",
      orderType: "Retouching",
      quantity: 210,
      actor,
      correlationId: "22222222-2222-4222-8222-222222222222",
      createdAt: new Date("2026-02-23T12:00:00.000Z"),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });

    const row = await prisma.sheetMirrorOutbox.findFirst({ where: { orderId: order.id } });
    expect(row).toMatchObject({
      status: "PENDING",
      operation: "UPSERT",
      payload: expect.objectContaining({
        Date: "23/02/2026",
        Client: "FN",
        "Order Name": "FN 02-20-26_Zea",
        Quantity: "210",
      }),
    });
  });

  it("claims with blankRowAfter false inside a same-client date group", async () => {
    const client = await seedClient();
    const first = await createOrder(prisma, {
      clientId: client.id,
      title: "FN 02-21-26_Edrys",
      orderType: "Retouching",
      quantity: 153,
      actor,
      correlationId: "33333333-3333-4333-8333-333333333333",
      createdAt: new Date("2026-02-23T12:00:00.000Z"),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });
    const second = await createOrder(prisma, {
      clientId: client.id,
      title: "FN 02-21-26_Nauhane",
      orderType: "Retouching",
      quantity: 199,
      actor,
      correlationId: "44444444-4444-4444-8444-444444444444",
      createdAt: new Date("2026-02-23T12:05:00.000Z"),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });

    const claims = await claimPendingMirror(prisma, 10);
    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({
      orderId: first.id,
      blankRowAfter: false,
      matchColumn: "Order Name",
      status: "CLAIMED",
    });
    expect(claims[1]).toMatchObject({
      orderId: second.id,
      blankRowAfter: true,
      status: "CLAIMED",
    });
    await expect(claimPendingMirror(prisma)).resolves.toEqual([]);
  });

  it("marks DONE idempotently with providerRowKey", async () => {
    const client = await seedClient("Yeti", "YETI");
    const order = await createOrder(prisma, {
      clientId: client.id,
      title: "Yeti Royal Blue Soft Coolers",
      orderType: "Retouching",
      quantity: 12,
      actor,
      correlationId: "55555555-5555-4555-8555-555555555555",
      createdAt: new Date("2026-02-21T12:00:00.000Z"),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });
    const [claim] = await claimPendingMirror(prisma, 1);
    expect(claim).toBeDefined();

    await expect(
      markMirrorDone(prisma, { id: claim!.id, providerRowKey: "row:42" }),
    ).resolves.toMatchObject({ status: "DONE", providerRowKey: "row:42" });
    await expect(
      markMirrorDone(prisma, { id: claim!.id, providerRowKey: "row:42" }),
    ).resolves.toMatchObject({ status: "DONE", providerRowKey: "row:42" });
    await expect(
      markMirrorDone(prisma, { id: claim!.id, providerRowKey: "row:99" }),
    ).rejects.toBeInstanceOf(SheetMirrorStateError);

    await expect(
      enqueueSheetMirror(prisma, {
        orderId: order.id,
        correlationId: "66666666-6666-4666-8666-666666666666",
      }),
    ).resolves.toBeUndefined();
    await expect(prisma.sheetMirrorOutbox.count({ where: { orderId: order.id } })).resolves.toBe(2);
  });
});
