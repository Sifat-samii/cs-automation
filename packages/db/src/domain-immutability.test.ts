import {
  OrderBatchStatus as PrismaOrderBatchStatus,
  OrderStatus as PrismaOrderStatus,
} from "@prisma/client";
import { BATCH_STATUSES, ORDER_STATUSES } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./index.js";
import { resetDatabase } from "./testing.js";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";

async function createClient(code: string = "VRLY") {
  return prisma.client.create({
    data: {
      code,
      displayName: `${code} Client`,
      folderName: code,
    },
  });
}

async function createActor() {
  return prisma.user.create({
    data: {
      id: actorUserId,
      loginId: "2061",
      displayName: "Sifat Sami",
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
}

async function createOrder(clientId: string, code: string = "VRLY_260726_001") {
  return prisma.order.create({
    data: {
      code,
      clientId,
      title: "Spring Drop",
      orderType: "Standard",
      folderName: `${code}__spring_drop`,
      backupPath: `\\\\server\\share\\VRLY\\${code}__spring_drop`,
      productionPath: `\\\\server\\production\\VRLY\\${code}__spring_drop`,
      createdById: actorUserId,
    },
  });
}

describe("Phase 1 domain invariants", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps shared lifecycle statuses in parity with the Prisma enums", () => {
    expect(new Set(Object.values(PrismaOrderStatus))).toEqual(new Set(ORDER_STATUSES));
    expect(new Set(Object.values(PrismaOrderBatchStatus))).toEqual(new Set(BATCH_STATUSES));
  });

  it("refuses OrderEvent updates and deletes at the database level", async () => {
    await createActor();
    const client = await createClient();
    const order = await createOrder(client.id);
    const event = await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "order.created",
        actorUserId,
        actorLabel: "Sifat Sami",
        correlationId,
      },
    });

    await expect(
      prisma.orderEvent.update({
        where: { id: event.id },
        data: { type: "order.tampered" },
      }),
    ).rejects.toThrow(/append-only/i);
    await expect(prisma.orderEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /append-only/i,
    );
  });

  it("enforces unique order codes", async () => {
    await createActor();
    const client = await createClient();
    await createOrder(client.id);
    await expect(createOrder(client.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces identity uniqueness by kind and value", async () => {
    const first = await createClient("FIRST");
    const second = await createClient("SECOND");
    await prisma.clientIdentity.create({
      data: {
        clientId: first.id,
        kind: "ADDRESS",
        value: "orders@example.com",
      },
    });

    await expect(
      prisma.clientIdentity.create({
        data: {
          clientId: second.id,
          kind: "ADDRESS",
          value: "orders@example.com",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("refuses to delete a client that has orders", async () => {
    await createActor();
    const client = await createClient();
    await createOrder(client.id);

    await expect(prisma.client.delete({ where: { id: client.id } })).rejects.toThrow(
      /restrict|foreign key/i,
    );
    await expect(prisma.client.findUnique({ where: { id: client.id } })).resolves.toBeTruthy();
  });

  it("cascades identities when deleting a client without orders", async () => {
    const client = await createClient();
    await prisma.clientIdentity.create({
      data: {
        clientId: client.id,
        kind: "DOMAIN",
        value: "example.com",
      },
    });

    await prisma.client.delete({ where: { id: client.id } });
    await expect(prisma.clientIdentity.count({ where: { clientId: client.id } })).resolves.toBe(0);
  });

  it("rejects orphan actor ids on audit-bearing order records", async () => {
    const client = await createClient();
    await expect(createOrder(client.id)).rejects.toMatchObject({ code: "P2003" });
  });
});
