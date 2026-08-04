import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  approveOutboundEmail,
  draftOutboundEmail,
  requeueOutboundAfterTransportFailure,
  claimPendingOutbound,
  markOutboundSent,
  OutboundStateError,
} from "@/lib/outbound/service";
import { GATE_BLOCKED_PLACEHOLDER } from "@/lib/outbound/templates";

const actorUserId = "11111111-1111-4111-8111-111111111111";

async function createFixtures(): Promise<{ orderId: string }> {
  await prisma.user.create({
    data: {
      id: actorUserId,
      loginId: "2061",
      displayName: "Sifat Sami",
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
      gmailThreadId: "gmail-thread-1",
      folderName: "VRLY_260726_001__spring_drop",
      backupPath: "\\\\server\\backup\\Verily\\VRLY_260726_001__spring_drop",
      productionPath: "\\\\server\\production\\Verily\\VRLY_260726_001__spring_drop",
      createdById: actorUserId,
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
  return { orderId: order.id };
}

describe("outbound email service", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("claims system-approved receipt rows without an order or human approver", async () => {
    await createFixtures();
    await prisma.emailMessage.create({
      data: {
        gmailMessageId: "gmail-message-receipt",
        gmailThreadId: "gmail-thread-receipt",
        direction: "INBOUND",
        fromAddress: "buyer@example.com",
        toAddresses: ["cs@example.test"],
        subject: "Hello",
        bodyText: "Body",
        receivedAt: new Date("2026-07-26T12:00:00.000Z"),
      },
    });
    const message = await prisma.emailMessage.findUniqueOrThrow({
      where: { gmailMessageId: "gmail-message-receipt" },
    });
    await prisma.outboundEmail.create({
      data: {
        emailMessageId: message.id,
        template: "RECEIPT_ACKNOWLEDGEMENT",
        renderedSubject: "Re: Hello — we received your email",
        renderedBody: "Working on it",
        status: "APPROVED",
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "receipt-ack:gmail-message-receipt",
        gmailThreadId: "gmail-thread-receipt",
      },
    });

    await expect(claimPendingOutbound(prisma)).resolves.toEqual([
      expect.objectContaining({
        idempotencyKey: "receipt-ack:gmail-message-receipt",
        toAddress: "buyer@example.com",
        status: "SENDING",
      }),
    ]);
  });

  it("renders pilot template drafts idempotently and allows human approval", async () => {
    const { orderId } = await createFixtures();
    const first = await draftOutboundEmail(prisma, {
      orderId,
      template: "ACKNOWLEDGEMENT",
      idempotencyKey: "ack:test",
    });
    const second = await draftOutboundEmail(prisma, {
      orderId,
      template: "ACKNOWLEDGEMENT",
      idempotencyKey: "ack:test",
    });
    expect(second.id).toBe(first.id);
    expect(first.renderedSubject).toBe("Re: Spring Drop — order received (VRLY_260726_001)");
    expect(first.renderedBody).toContain("Hi Verily,");
    expect(first.renderedBody).toContain('request for "Spring Drop"');
    expect(first.renderedBody).toContain("order VRLY_260726_001");
    expect(first.renderedBody).toContain("<br><br>");
    expect(first.renderedBody).toContain("Best regards,<br>Client Support");
    await expect(
      approveOutboundEmail(prisma, {
        outboundEmailId: first.id,
        approvedById: actorUserId,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", approvedById: actorUserId });
  });

  it("quarantines approved rows whose stored copy still contains the gate placeholder", async () => {
    const { orderId } = await createFixtures();
    await prisma.outboundEmail.create({
      data: {
        orderId,
        template: "ACKNOWLEDGEMENT",
        renderedSubject: GATE_BLOCKED_PLACEHOLDER,
        renderedBody: GATE_BLOCKED_PLACEHOLDER,
        status: "APPROVED",
        approvedById: actorUserId,
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "ack:blocked",
        gmailThreadId: "gmail-thread-1",
      },
    });
    await expect(claimPendingOutbound(prisma)).resolves.toEqual([]);
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({ where: { idempotencyKey: "ack:blocked" } }),
    ).resolves.toMatchObject({
      status: "FAILED",
      lastError: "Gate-blocked placeholder reached the outbound queue",
    });
  });

  it("pending atomically claims only human-approved rows with the original thread recipient", async () => {
    const { orderId } = await createFixtures();
    await draftOutboundEmail(prisma, {
      orderId,
      template: "ACKNOWLEDGEMENT",
      idempotencyKey: "ack:draft",
    });
    await prisma.outboundEmail.create({
      data: {
        orderId,
        template: "FILES_VERIFIED",
        renderedSubject: "Approved subject",
        renderedBody: "Approved body",
        status: "APPROVED",
        approvedById: actorUserId,
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "verified:approved",
        gmailThreadId: "gmail-thread-1",
      },
    });

    await expect(claimPendingOutbound(prisma)).resolves.toEqual([
      expect.objectContaining({
        idempotencyKey: "verified:approved",
        toAddress: "buyer@example.com",
        gmailThreadId: "gmail-thread-1",
        status: "SENDING",
      }),
    ]);
    await expect(claimPendingOutbound(prisma)).resolves.toEqual([]);
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: "verified:approved" },
      }),
    ).resolves.toMatchObject({ status: "SENDING" });
  });

  it("allows exactly one concurrent poll to claim an approved row", async () => {
    const { orderId } = await createFixtures();
    await prisma.outboundEmail.create({
      data: {
        orderId,
        template: "FILES_VERIFIED",
        renderedSubject: "Approved subject",
        renderedBody: "Approved body",
        status: "APPROVED",
        approvedById: actorUserId,
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "verified:concurrent",
        gmailThreadId: "gmail-thread-1",
      },
    });

    const results = await Promise.all([
      claimPendingOutbound(prisma, 1),
      claimPendingOutbound(prisma, 1),
    ]);
    expect(results.flat()).toHaveLength(1);
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: "verified:concurrent" },
      }),
    ).resolves.toMatchObject({ status: "SENDING" });
  });

  it("fails an invalid row in isolation without blocking valid outbound", async () => {
    const { orderId } = await createFixtures();
    await prisma.outboundEmail.createMany({
      data: [
        {
          orderId,
          template: "FILES_VERIFIED",
          renderedSubject: "Invalid",
          renderedBody: "Invalid",
          status: "APPROVED",
          approvedById: actorUserId,
          approvedAt: new Date("2026-07-26T13:00:00.000Z"),
          idempotencyKey: "verified:invalid",
          gmailThreadId: "missing-thread",
        },
        {
          orderId,
          template: "FILES_VERIFIED",
          renderedSubject: "Valid",
          renderedBody: "Valid",
          status: "APPROVED",
          approvedById: actorUserId,
          approvedAt: new Date("2026-07-26T13:01:00.000Z"),
          idempotencyKey: "verified:valid",
          gmailThreadId: "gmail-thread-1",
        },
      ],
    });

    await expect(claimPendingOutbound(prisma)).resolves.toEqual([
      expect.objectContaining({ idempotencyKey: "verified:valid", status: "SENDING" }),
    ]);
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { idempotencyKey: "verified:invalid" },
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      lastError: "No inbound recipient exists for this Gmail thread",
    });
  });

  it("requeues SENDING rows without a provider message id after transport failure", async () => {
    const { orderId } = await createFixtures();
    const approved = await prisma.outboundEmail.create({
      data: {
        orderId,
        template: "FILES_VERIFIED",
        renderedSubject: "Approved subject",
        renderedBody: "Approved body",
        status: "APPROVED",
        approvedById: actorUserId,
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "verified:requeue",
        gmailThreadId: "gmail-thread-1",
      },
    });
    await expect(claimPendingOutbound(prisma)).resolves.toHaveLength(1);

    const requeued = await requeueOutboundAfterTransportFailure(prisma, {
      outboundEmailId: approved.id,
      error: "Gmail API timeout",
    });
    expect(requeued).toMatchObject({
      status: "APPROVED",
      sentMessageId: null,
      lastError: "Gmail API timeout",
    });
    await expect(claimPendingOutbound(prisma)).resolves.toEqual([
      expect.objectContaining({ id: approved.id, status: "SENDING" }),
    ]);
  });

  it("cannot mark a draft sent and marks an approved row sent idempotently", async () => {
    const { orderId } = await createFixtures();
    const draft = await draftOutboundEmail(prisma, {
      orderId,
      template: "ACKNOWLEDGEMENT",
      idempotencyKey: "ack:draft",
    });
    await expect(
      markOutboundSent(prisma, {
        outboundEmailId: draft.id,
        sentMessageId: "gmail-sent-1",
      }),
    ).rejects.toBeInstanceOf(OutboundStateError);

    const approved = await prisma.outboundEmail.create({
      data: {
        orderId,
        template: "FILES_VERIFIED",
        renderedSubject: "Approved subject",
        renderedBody: "Approved body",
        status: "APPROVED",
        approvedById: actorUserId,
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "verified:approved",
        gmailThreadId: "gmail-thread-1",
      },
    });
    await expect(claimPendingOutbound(prisma)).resolves.toHaveLength(1);
    const sent = await markOutboundSent(prisma, {
      outboundEmailId: approved.id,
      sentMessageId: "gmail-sent-1",
    });
    expect(sent).toMatchObject({ status: "SENT", sentMessageId: "gmail-sent-1" });
    await expect(
      markOutboundSent(prisma, {
        outboundEmailId: approved.id,
        sentMessageId: "gmail-sent-1",
      }),
    ).resolves.toMatchObject({ status: "SENT" });
    await expect(
      markOutboundSent(prisma, {
        outboundEmailId: approved.id,
        sentMessageId: "another-message",
      }),
    ).rejects.toBeInstanceOf(OutboundStateError);
  });

  it("skips claiming outbound mail while the thread is paused", async () => {
    const { orderId } = await createFixtures();
    await prisma.order.update({
      where: { id: orderId },
      data: { communicationPaused: true },
    });
    await prisma.mailThreadState.create({
      data: { gmailThreadId: "gmail-thread-1", paused: true },
    });
    await prisma.outboundEmail.create({
      data: {
        orderId,
        template: "ORDER_CONFIRMATION",
        renderedSubject: "Confirmed",
        renderedBody: "Confirmed",
        status: "APPROVED",
        approvedAt: new Date("2026-07-26T13:00:00.000Z"),
        idempotencyKey: "confirm:paused",
        gmailThreadId: "gmail-thread-1",
      },
    });
    await expect(claimPendingOutbound(prisma)).resolves.toHaveLength(0);
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({ where: { idempotencyKey: "confirm:paused" } }),
    ).resolves.toMatchObject({ status: "APPROVED" });
  });
});
