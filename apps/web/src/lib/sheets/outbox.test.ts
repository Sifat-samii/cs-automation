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

  it("coalesces repeated PENDING enqueues for the same order", async () => {
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

    await enqueueSheetMirror(prisma, {
      orderId: order.id,
      correlationId: "77777777-7777-4777-8777-777777777777",
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { title: "FN 02-20-26_Zea_v2", quantity: 211 },
    });
    await enqueueSheetMirror(prisma, {
      orderId: order.id,
      correlationId: "88888888-8888-4888-8888-888888888888",
    });

    await expect(prisma.sheetMirrorOutbox.count({ where: { orderId: order.id } })).resolves.toBe(1);
    await expect(
      prisma.sheetMirrorOutbox.findFirstOrThrow({ where: { orderId: order.id } }),
    ).resolves.toMatchObject({
      status: "PENDING",
      payload: expect.objectContaining({
        "Order Name": "FN 02-20-26_Zea_v2",
        Quantity: "211",
      }),
    });
  });

  it("claims only the latest PENDING row when the same order was enqueued twice", async () => {
    const client = await seedClient("Dup", "DUP");
    const order = await createOrder(prisma, {
      clientId: client.id,
      title: "Dup order",
      orderType: "Retouching",
      quantity: 1,
      actor,
      correlationId: "99999999-9999-4999-8999-999999999999",
      createdAt: new Date("2026-02-23T12:00:00.000Z"),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });
    // Force a historical duplicate PENDING that predated coalescing.
    await prisma.sheetMirrorOutbox.create({
      data: {
        orderId: order.id,
        operation: "UPSERT",
        status: "PENDING",
        payload: {
          Date: "23/02/2026",
          Client: "Dup",
          "Order Name": "Dup order older",
          Quantity: "1",
          orderCode: order.code,
          placementGroup: "x",
        },
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { title: "Dup order newer" },
    });
    await enqueueSheetMirror(prisma, {
      orderId: order.id,
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const claims = await claimPendingMirror(prisma, 10);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      orderId: order.id,
      row: expect.objectContaining({ "Order Name": "Dup order newer" }),
    });
    await expect(
      prisma.sheetMirrorOutbox.count({
        where: { orderId: order.id, status: "DONE", providerRowKey: { startsWith: "superseded:" } },
      }),
    ).resolves.toBe(1);
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
