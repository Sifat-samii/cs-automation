import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { IllegalTransitionError } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setBatchStatus, setEta, setOrderStatus } from "@/lib/orders/lifecycle";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-26T12:00:00.000Z");

async function createOrderAndBatch() {
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
  const order = await prisma.order.create({
    data: {
      code: "VRLY_260726_001",
      clientId: client.id,
      title: "Spring Drop",
      orderType: "Retouching",
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actor.userId,
    },
  });
  const batch = await prisma.orderBatch.create({
    data: {
      orderId: order.id,
      sequence: 1,
      kind: "INITIAL",
      subfolder: "01_INITIAL",
      createdById: actor.userId,
    },
  });
  return { order, batch };
}

describe("order and batch lifecycle services", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("refuses an illegal order status change without writing events", async () => {
    const { order } = await createOrderAndBatch();

    await expect(
      setOrderStatus(prisma, {
        orderId: order.id,
        status: "IN_PRODUCTION",
        actor,
        correlationId,
      }),
    ).rejects.toThrow(IllegalTransitionError);
    await expect(prisma.order.findUnique({ where: { id: order.id } })).resolves.toMatchObject({
      status: "DRAFT",
    });
    await expect(prisma.orderEvent.count()).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("records a legal order transition in both timelines", async () => {
    const { order } = await createOrderAndBatch();
    const updated = await setOrderStatus(prisma, {
      orderId: order.id,
      status: "ACKNOWLEDGED",
      actor,
      correlationId,
    });

    expect(updated.status).toBe("ACKNOWLEDGED");
    await expect(
      prisma.orderEvent.findFirst({ where: { orderId: order.id } }),
    ).resolves.toMatchObject({ type: "order.status_changed" });
    await expect(
      prisma.auditEvent.findFirst({
        where: { entityType: "Order", entityId: order.id },
      }),
    ).resolves.toMatchObject({ action: "order.status_changed" });
  });

  it("validates and records batch transitions atomically", async () => {
    const { batch } = await createOrderAndBatch();
    const updated = await setBatchStatus(prisma, {
      batchId: batch.id,
      status: "DOWNLOADING",
      actor,
      correlationId,
    });

    expect(updated.status).toBe("DOWNLOADING");
    await expect(
      prisma.orderEvent.findFirst({ where: { batchId: batch.id } }),
    ).resolves.toMatchObject({ type: "batch.status_changed" });
    await expect(
      prisma.auditEvent.findFirst({
        where: { entityType: "OrderBatch", entityId: batch.id },
      }),
    ).resolves.toMatchObject({ action: "batch.status_changed" });

    await expect(
      setBatchStatus(prisma, {
        batchId: batch.id,
        status: "VERIFIED",
        actor,
        correlationId,
      }),
    ).rejects.toThrow(IllegalTransitionError);
    await expect(prisma.orderEvent.count()).resolves.toBe(1);
    await expect(prisma.auditEvent.count()).resolves.toBe(1);
  });

  it("blocks manual batch transitions after transfer jobs exist", async () => {
    const { batch } = await createOrderAndBatch();
    await prisma.transferJob.create({
      data: {
        batchId: batch.id,
        kind: "DOWNLOAD",
        correlationId,
      },
    });

    await expect(
      setBatchStatus(prisma, {
        batchId: batch.id,
        status: "CANCELLED",
        actor,
        correlationId,
      }),
    ).rejects.toThrow(/controlled by|disabled after|transfer pipeline/iu);
    await expect(
      prisma.orderBatch.findUniqueOrThrow({ where: { id: batch.id } }),
    ).resolves.toMatchObject({ status: "PENDING" });
    await expect(prisma.orderEvent.count()).resolves.toBe(0);
  });

  it("refuses an ETA earlier than now without writing events", async () => {
    const { order } = await createOrderAndBatch();

    await expect(
      setEta(prisma, {
        orderId: order.id,
        eta: new Date("2026-07-26T11:59:59.000Z"),
        actor,
        correlationId,
        now,
      }),
    ).rejects.toThrow(/future/i);
    await expect(prisma.order.findUnique({ where: { id: order.id } })).resolves.toMatchObject({
      eta: null,
    });
    await expect(prisma.orderEvent.count()).resolves.toBe(0);
    await expect(prisma.auditEvent.count()).resolves.toBe(0);
  });

  it("records a future ETA and note in both timelines", async () => {
    const { order } = await createOrderAndBatch();
    const eta = new Date("2026-07-28T09:00:00.000Z");
    const updated = await setEta(prisma, {
      orderId: order.id,
      eta,
      note: "Subject to final file count",
      actor,
      correlationId,
      now,
    });

    expect(updated.eta).toEqual(eta);
    expect(updated.etaNote).toBe("Subject to final file count");
    await expect(
      prisma.orderEvent.findFirst({ where: { orderId: order.id } }),
    ).resolves.toMatchObject({ type: "order.eta_set" });
    await expect(
      prisma.auditEvent.findFirst({
        where: { entityType: "Order", entityId: order.id },
      }),
    ).resolves.toMatchObject({ action: "order.eta_set" });
  });
});
