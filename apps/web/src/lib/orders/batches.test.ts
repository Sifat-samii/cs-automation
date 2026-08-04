import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addBatch } from "@/lib/orders/batches";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";

async function createOrder(status: "UNASSIGNED" | "IN_PRODUCTION" | "READY_TO_UPLOAD") {
  await prisma.user.create({
    data: {
      id: actor.userId,
      loginId: "2061",
      displayName: actor.label,
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
  const client = await prisma.client.create({
    data: {
      code: "VRLY",
      displayName: "Verily",
      folderName: "Verily",
    },
  });
  return prisma.order.create({
    data: {
      code: "VRLY_260726_001",
      clientId: client.id,
      title: "Spring Drop",
      orderType: "Retouching",
      status,
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actor.userId,
      batches: {
        create: {
          sequence: 1,
          kind: "INITIAL",
          subfolder: "01_INITIAL",
          createdById: actor.userId,
        },
      },
    },
  });
}

describe("addBatch", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refuses to add a batch to a ready-to-upload order", async () => {
    const order = await createOrder("READY_TO_UPLOAD");

    await expect(
      addBatch(prisma, {
        orderId: order.id,
        kind: "ADDITIONAL",
        actor,
        correlationId,
      }),
    ).rejects.toThrow(/terminal/i);
    await expect(prisma.orderBatch.count()).resolves.toBe(1);
    await expect(prisma.orderEvent.count()).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("adds a correction while its order is in production", async () => {
    const order = await createOrder("IN_PRODUCTION");
    const batch = await addBatch(prisma, {
      orderId: order.id,
      kind: "CORRECTION",
      notes: "Replace two images",
      sourceLinks: [
        {
          kind: "GDRIVE",
          url: "https://example.com/correction",
        },
      ],
      actor,
      correlationId,
    });

    expect(batch).toMatchObject({
      orderId: order.id,
      sequence: 2,
      kind: "CORRECTION",
      status: "PENDING",
      subfolder: "02_CORRECTION",
      notes: "Replace two images",
    });
    await expect(prisma.sourceLink.count({ where: { batchId: batch.id } })).resolves.toBe(1);
    await expect(
      prisma.orderEvent.findFirst({ where: { batchId: batch.id } }),
    ).resolves.toMatchObject({
      type: "batch.added",
      actorUserId: actor.userId,
      correlationId,
    });
    await expect(
      prisma.auditEvent.findFirst({
        where: { entityType: "OrderBatch", entityId: batch.id },
      }),
    ).resolves.toMatchObject({
      action: "batch.added",
      actorUserId: actor.userId,
      correlationId,
    });
  });
});
