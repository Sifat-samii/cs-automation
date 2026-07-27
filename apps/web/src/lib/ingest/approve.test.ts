import { prisma, type DbClient } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { approveProposal } from "@/lib/ingest/approve";
import { ingestEmail } from "@/lib/ingest/service";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  label: "Sifat Sami",
};
const correlationId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-26T12:00:00.000Z");

async function createFixtures(): Promise<{ proposalId: string }> {
  await prisma.user.create({
    data: {
      id: actor.userId,
      loginId: "2061",
      displayName: actor.label,
      passwordHash: "test-only-password-hash",
      role: "CS_LEAD",
    },
  });
  await prisma.client.create({
    data: {
      code: "VRLY",
      displayName: "Verily",
      folderName: "Verily",
      identities: { create: { kind: "DOMAIN", value: "example.com" } },
    },
  });
  const ingested = await ingestEmail(
    prisma,
    {
      gmailMessageId: "gmail-message-1",
      gmailThreadId: "gmail-thread-1",
      fromAddress: "buyer@example.com",
      toAddresses: ["cs@example.test"],
      subject: "Spring drop",
      bodyText: "https://www.dropbox.com/s/abc/files.zip?dl=0",
      receivedAt: now,
    },
    { orchestrate: false },
  );
  return { proposalId: ingested.proposalId };
}

describe("atomic proposal approval", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates order, batch, job, event, and audit without drafting acknowledgement", async () => {
    const { proposalId } = await createFixtures();
    await expect(prisma.outboundEmail.count()).resolves.toBe(1);
    await expect(
      prisma.outboundEmail.findFirstOrThrow({
        where: { template: "RECEIPT_ACKNOWLEDGEMENT" },
      }),
    ).resolves.toMatchObject({ status: "APPROVED", orderId: null });

    const result = await approveProposal(prisma, {
      proposalId,
      actor,
      correlationId,
      now,
      overrides: {
        downloadUrl: "https://www.dropbox.com/s/abc/files.zip?dl=0",
        eta: new Date("2026-07-29T09:00:00.000Z"),
      },
    });

    expect(result.orderId).not.toBeNull();
    expect(result.batchId).not.toBeNull();
    expect(result.outboundEmailId).toBeNull();
    await expect(prisma.order.count()).resolves.toBe(1);
    await expect(prisma.orderBatch.count()).resolves.toBe(1);
    await expect(prisma.sourceLink.count()).resolves.toBe(1);
    await expect(prisma.transferJob.count()).resolves.toBe(1);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: result.orderId ?? "" } }),
    ).resolves.toMatchObject({
      status: "UNASSIGNED",
      eta: new Date("2026-07-29T09:00:00.000Z"),
      gmailThreadId: "gmail-thread-1",
    });
    await expect(
      prisma.outboundEmail.count({ where: { template: "ACKNOWLEDGEMENT" } }),
    ).resolves.toBe(0);
    await expect(
      prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } }),
    ).resolves.toMatchObject({ status: "ACCEPTED", decidedById: actor.userId });
    await expect(prisma.emailMessage.findFirstOrThrow()).resolves.toMatchObject({
      triageStatus: "LINKED",
      orderId: result.orderId,
    });
    await expect(
      prisma.orderEvent.count({ where: { type: "email.proposal_accepted" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditEvent.count({ where: { action: "email.proposal_accepted" } }),
    ).resolves.toBe(1);
  });

  it("queues transfer from download URL without setting ETA", async () => {
    const { proposalId } = await createFixtures();
    const result = await approveProposal(prisma, {
      proposalId,
      actor,
      correlationId,
      now,
      overrides: {
        downloadUrl: "https://www.dropbox.com/s/abc/files.zip?dl=0",
      },
    });

    expect(result.outboundEmailId).toBeNull();
    await expect(prisma.transferJob.count()).resolves.toBe(1);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: result.orderId ?? "" } }),
    ).resolves.toMatchObject({ eta: null });
    await expect(
      prisma.outboundEmail.count({ where: { template: "ACKNOWLEDGEMENT" } }),
    ).resolves.toBe(0);
  });

  it("rolls back entirely when transfer queuing fails inside the boundary", async () => {
    const { proposalId } = await createFixtures();
    const queueTransfer = vi.fn(
      async (
        _db: DbClient,
        _input: { batchId: string; correlationId: string; maxAttempts?: number },
      ) => {
        throw new Error("queue unavailable");
      },
    );

    await expect(
      approveProposal(prisma, { proposalId, actor, correlationId, now }, { queueTransfer }),
    ).rejects.toThrow("queue unavailable");
    await expect(prisma.order.count()).resolves.toBe(0);
    await expect(prisma.orderBatch.count()).resolves.toBe(0);
    await expect(prisma.transferJob.count()).resolves.toBe(0);
    await expect(prisma.outboundEmail.count()).resolves.toBe(1);
    await expect(prisma.outboundEmail.findFirstOrThrow()).resolves.toMatchObject({
      template: "RECEIPT_ACKNOWLEDGEMENT",
    });
    await expect(
      prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } }),
    ).resolves.toMatchObject({ status: "PENDING", decidedById: null });
    await expect(prisma.emailMessage.findFirstOrThrow()).resolves.toMatchObject({
      triageStatus: "UNREVIEWED",
      orderId: null,
    });
  });

  it("never creates a second order when the same proposal is approved twice", async () => {
    const { proposalId } = await createFixtures();
    const first = await approveProposal(prisma, {
      proposalId,
      actor,
      correlationId,
      now,
    });
    const second = await approveProposal(prisma, {
      proposalId,
      actor,
      correlationId,
      now,
    });

    expect(second.orderId).toBe(first.orderId);
    expect(second.outboundEmailId).toBe(first.outboundEmailId);
    await expect(prisma.order.count()).resolves.toBe(1);
    await expect(prisma.orderBatch.count()).resolves.toBe(1);
    await expect(prisma.transferJob.count()).resolves.toBe(1);
    await expect(prisma.outboundEmail.count()).resolves.toBe(1);
  });

  it("links a previously manual order to the Gmail thread before adding a batch", async () => {
    const { proposalId } = await createFixtures();
    const client = await prisma.client.findFirstOrThrow();
    const target = await prisma.order.create({
      data: {
        code: "VRLY_260726_900",
        clientId: client.id,
        title: "Existing manual order",
        orderType: "Standard",
        folderName: "VRLY_260726_900__existing_manual_order",
        backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_900__existing_manual_order",
        productionPath: "\\\\server\\production\\Verily\\VRLY_260726_900__existing_manual_order",
        createdById: actor.userId,
      },
    });

    const result = await approveProposal(prisma, {
      proposalId,
      actor,
      correlationId,
      now,
      overrides: { targetOrderId: target.id },
    });

    expect(result.orderId).toBe(target.id);
    expect(result.outboundEmailId).toBeNull();
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ gmailThreadId: "gmail-thread-1" });
    await expect(
      prisma.outboundEmail.findFirstOrThrow({
        where: { template: "RECEIPT_ACKNOWLEDGEMENT" },
      }),
    ).resolves.toMatchObject({ gmailThreadId: "gmail-thread-1" });
  });

  it("rejects linking a resolved client email to another client's order", async () => {
    const { proposalId } = await createFixtures();
    const otherClient = await prisma.client.create({
      data: {
        code: "OTHER",
        displayName: "Other client",
        folderName: "Other client",
      },
    });
    const target = await prisma.order.create({
      data: {
        code: "OTHER_260726_001",
        clientId: otherClient.id,
        title: "Other order",
        orderType: "Standard",
        folderName: "OTHER_260726_001__other_order",
        backupPath: "\\\\server\\backup\\Other client\\OTHER_260726_001__other_order",
        productionPath: "\\\\server\\production\\Other client\\OTHER_260726_001__other_order",
        createdById: actor.userId,
      },
    });

    await expect(
      approveProposal(prisma, {
        proposalId,
        actor,
        correlationId,
        now,
        overrides: { targetOrderId: target.id },
      }),
    ).rejects.toThrow("Target order does not belong to the resolved client");
    await expect(prisma.orderBatch.count({ where: { orderId: target.id } })).resolves.toBe(0);
    await expect(
      prisma.proposal.findUniqueOrThrow({ where: { id: proposalId } }),
    ).resolves.toMatchObject({ status: "PENDING" });
  });
});
