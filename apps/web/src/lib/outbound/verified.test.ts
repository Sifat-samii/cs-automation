import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { approveOrder, setOrderEta } from "@/lib/orders/lifecycle";
import { handleBatchVerified } from "@/lib/outbound/verified";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";

async function createFixtures(input?: {
  orderStatus?: "UNASSIGNED" | "IN_PRODUCTION";
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
      status: input?.orderStatus ?? "IN_PRODUCTION",
      ...(input?.eta ? { eta: input.eta, etaLockedAt: input.eta, etaSentAt: input.eta } : {}),
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

  it("system-approves FILES_VERIFIED without changing order status", async () => {
    const eta = new Date("2026-07-28T09:00:00.000Z");
    const fixture = await createFixtures({ orderStatus: "IN_PRODUCTION", eta });
    const result = await handleBatchVerified(prisma, {
      batchId: fixture.batchId,
      correlationId,
    });
    expect(result.outboundEmailId).toBeTruthy();
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: `files-verified:${fixture.batchId}` },
      }),
    ).resolves.toMatchObject({
      template: "FILES_VERIFIED",
      status: "APPROVED",
      approvedById: null,
    });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } }),
    ).resolves.toMatchObject({ status: "IN_PRODUCTION", eta });
  });

  it("drafts ETA_UPDATE when ETA is set on an in-production order", async () => {
    const fixture = await createFixtures({ orderStatus: "UNASSIGNED" });
    await approveOrder(prisma, {
      orderId: fixture.orderId,
      actor,
      correlationId,
      now: new Date("2026-07-26T12:00:00.000Z"),
    });
    const eta = new Date("2026-07-29T09:00:00.000Z");
    await setOrderEta(prisma, {
      orderId: fixture.orderId,
      eta,
      actor,
      correlationId,
      now: new Date("2026-07-26T12:00:00.000Z"),
    });
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: `eta-update:${fixture.orderId}:${eta.toISOString()}` },
      }),
    ).resolves.toMatchObject({ template: "ETA_UPDATE", status: "APPROVED" });
  });
});
