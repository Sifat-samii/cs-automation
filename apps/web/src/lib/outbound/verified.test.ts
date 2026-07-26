import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setEta } from "@/lib/orders/lifecycle";
import { handleBatchVerified } from "@/lib/outbound/verified";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";

async function createFixtures(input: {
  orderStatus: "DRAFT" | "ACKNOWLEDGED" | "AWAITING_ETA";
  eta?: Date;
}): Promise<{ orderId: string; batchId: string }> {
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
    data: { code: "VRLY", displayName: "Verily", folderName: "Verily" },
  });
  const order = await prisma.order.create({
    data: {
      code: "VRLY_260726_001",
      clientId: client.id,
      title: "Spring Drop",
      orderType: "Standard",
      status: input.orderStatus,
      ...(input.eta ? { eta: input.eta } : {}),
      gmailThreadId: "gmail-thread-1",
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actor.userId,
      emailMessages: {
        create: {
          gmailMessageId: "gmail-message-1",
          gmailThreadId: "gmail-thread-1",
          direction: "INBOUND",
          fromAddress: "buyer@example.com",
          toAddresses: ["cs@example.test"],
          subject: "Request",
          bodyText: "Files",
          receivedAt: new Date("2026-07-26T12:00:00.000Z"),
        },
      },
    },
  });
  const batch = await prisma.orderBatch.create({
    data: {
      orderId: order.id,
      sequence: 1,
      kind: "INITIAL",
      status: "VERIFIED",
      subfolder: "01_INITIAL",
      createdById: actor.userId,
    },
  });
  return { orderId: order.id, batchId: batch.id };
}

describe("files-verified and ETA outbound drafting", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("drafts FILES_VERIFIED with an existing ETA without changing order status", async () => {
    const eta = new Date("2026-07-28T09:00:00.000Z");
    const fixture = await createFixtures({ orderStatus: "ACKNOWLEDGED", eta });
    const result = await handleBatchVerified(prisma, {
      batchId: fixture.batchId,
      correlationId,
    });
    expect(result).toMatchObject({
      transitionedToAwaitingEta: false,
    });
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: `files-verified:${fixture.batchId}` },
      }),
    ).resolves.toMatchObject({ template: "FILES_VERIFIED", status: "DRAFT" });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    ).resolves.toMatchObject({ status: "ACKNOWLEDGED", eta });
  });

  it("drafts FILES_VERIFIED and moves an acknowledged order to AWAITING_ETA", async () => {
    const fixture = await createFixtures({ orderStatus: "ACKNOWLEDGED" });
    const result = await handleBatchVerified(prisma, {
      batchId: fixture.batchId,
      correlationId,
    });
    expect(result.transitionedToAwaitingEta).toBe(true);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    ).resolves.toMatchObject({ status: "AWAITING_ETA", eta: null });
    await expect(
      prisma.orderEvent.findFirst({
        where: { orderId: fixture.orderId, type: "order.status_changed" },
      }),
    ).resolves.toBeTruthy();
  });

  it("drafts ETA_NOTICE when ETA is set while awaiting it", async () => {
    const fixture = await createFixtures({ orderStatus: "AWAITING_ETA" });
    const eta = new Date("2026-07-29T09:00:00.000Z");
    await setEta(prisma, {
      orderId: fixture.orderId,
      eta,
      actor,
      correlationId,
      now: new Date("2026-07-26T12:00:00.000Z"),
    });
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: `eta:${fixture.orderId}:${eta.toISOString()}` },
      }),
    ).resolves.toMatchObject({ template: "ETA_NOTICE", status: "DRAFT" });
  });
});
