import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveOrder,
  markReadyToUpload,
  setOrderEta,
  updateOrderDetails,
} from "@/lib/orders/lifecycle";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-26T12:00:00.000Z");

async function createUnassignedOrder(options?: { withThread?: boolean }) {
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
      status: "UNASSIGNED",
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actor.userId,
      ...(options?.withThread ? { gmailThreadId: "thread-1" } : {}),
    },
  });
  if (options?.withThread) {
    await prisma.emailMessage.create({
      data: {
        gmailMessageId: "msg-1",
        gmailThreadId: "thread-1",
        direction: "INBOUND",
        fromAddress: "buyer@example.com",
        toAddresses: ["cs@example.test"],
        subject: "Spring Drop",
        bodyText: "files please",
        receivedAt: now,
        orderId: order.id,
        clientId: client.id,
      },
    });
  }
  return { order, client };
}

describe("phase 4 order lifecycle services", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("approves an unassigned order into production and is idempotent", async () => {
    const { order } = await createUnassignedOrder({ withThread: true });
    const eta = new Date("2026-07-28T12:00:00.000Z");
    const approved = await approveOrder(prisma, {
      orderId: order.id,
      eta,
      actor,
      correlationId,
      now,
    });
    expect(approved.status).toBe("IN_PRODUCTION");
    expect(approved.etaLockedAt).not.toBeNull();
    expect(approved.etaSentAt).not.toBeNull();
    await expect(
      prisma.outboundEmail.findUnique({
        where: { idempotencyKey: `order-confirmation:${order.id}` },
      }),
    ).resolves.toMatchObject({ status: "APPROVED", template: "ORDER_CONFIRMATION" });

    const again = await approveOrder(prisma, {
      orderId: order.id,
      actor,
      correlationId,
      now,
    });
    expect(again.status).toBe("IN_PRODUCTION");
  });

  it("requires a reason when changing a locked ETA", async () => {
    const { order } = await createUnassignedOrder({ withThread: true });
    await approveOrder(prisma, {
      orderId: order.id,
      actor,
      correlationId,
      now,
    });
    const firstEta = new Date("2026-07-28T12:00:00.000Z");
    await setOrderEta(prisma, {
      orderId: order.id,
      eta: firstEta,
      actor,
      correlationId,
      now,
    });
    await expect(
      setOrderEta(prisma, {
        orderId: order.id,
        eta: new Date("2026-07-29T12:00:00.000Z"),
        actor,
        correlationId,
        now,
      }),
    ).rejects.toThrow(/reason/i);

    await expect(
      setOrderEta(prisma, {
        orderId: order.id,
        eta: new Date("2026-07-29T12:00:00.000Z"),
        reason: "Client requested later delivery",
        actor,
        correlationId,
        now,
      }),
    ).resolves.toMatchObject({ status: "IN_PRODUCTION" });
  });

  it("marks ready to upload only from in production", async () => {
    const { order } = await createUnassignedOrder();
    await expect(
      markReadyToUpload(prisma, { orderId: order.id, actor, correlationId }),
    ).rejects.toThrow(/In Production/i);

    await approveOrder(prisma, { orderId: order.id, actor, correlationId, now });
    await expect(
      markReadyToUpload(prisma, { orderId: order.id, actor, correlationId }),
    ).resolves.toMatchObject({ status: "READY_TO_UPLOAD" });
  });

  it("requires an emergency-edit reason and rejects ready-to-upload edits", async () => {
    const { order } = await createUnassignedOrder();
    await expect(
      updateOrderDetails(prisma, {
        orderId: order.id,
        title: "New",
        orderType: "Color",
        reason: "fix",
        actor,
        correlationId,
      }),
    ).rejects.toThrow(/reason/i);

    await expect(
      updateOrderDetails(prisma, {
        orderId: order.id,
        title: "New title",
        orderType: "Color",
        reason: "Client corrected title",
        actor,
        correlationId,
      }),
    ).resolves.toMatchObject({ title: "New title" });

    await approveOrder(prisma, { orderId: order.id, actor, correlationId, now });
    await markReadyToUpload(prisma, { orderId: order.id, actor, correlationId });
    await expect(
      updateOrderDetails(prisma, {
        orderId: order.id,
        title: "Nope",
        orderType: "Color",
        reason: "Should not work",
        actor,
        correlationId,
      }),
    ).rejects.toThrow(/ready-to-upload/i);
  });
});
