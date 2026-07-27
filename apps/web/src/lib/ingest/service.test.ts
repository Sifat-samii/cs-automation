import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ingestEmail, type IngestEmailInput } from "@/lib/ingest/service";

async function createClient(): Promise<string> {
  const client = await prisma.client.create({
    data: {
      code: "VRLY",
      displayName: "Verily",
      folderName: "Verily",
      identities: { create: { kind: "DOMAIN", value: "example.com" } },
    },
  });
  return client.id;
}

const input: IngestEmailInput = {
  gmailMessageId: "gmail-message-1",
  gmailThreadId: "gmail-thread-1",
  fromAddress: "buyer@example.com",
  toAddresses: ["cs@example.test"],
  subject: "Spring drop",
  bodyText: "Files: https://www.dropbox.com/s/abc/files.zip?dl=0",
  receivedAt: new Date("2026-07-26T12:00:00.000Z"),
};

describe("email ingest service", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    await createClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("auto-creates an UNASSIGNED order, accepts the proposal, and system-approves receipt", async () => {
    const result = await ingestEmail(prisma, input);
    expect(result.duplicate).toBe(false);
    expect(result.receiptOutboundEmailId).not.toBeNull();
    expect(result.orchestration?.orderId).toBeTruthy();
    expect(result.orchestration?.batchId).toBeTruthy();
    expect(result.orchestration?.classification?.intent).toBe("ORDER");
    await expect(prisma.emailMessage.count()).resolves.toBe(1);
    await expect(
      prisma.proposal.findUniqueOrThrow({ where: { id: result.proposalId } }),
    ).resolves.toMatchObject({
      kind: "CREATE_ORDER",
      source: "RULE",
      status: "ACCEPTED",
    });
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: result.orchestration!.orderId! } }),
    ).resolves.toMatchObject({ status: "UNASSIGNED" });
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({
        where: { id: result.receiptOutboundEmailId ?? "" },
      }),
    ).resolves.toMatchObject({
      template: "RECEIPT_ACKNOWLEDGEMENT",
      status: "APPROVED",
      approvedById: null,
      emailMessageId: result.emailMessageId,
    });
  });

  it("returns the existing identifiers on replay without creating another proposal", async () => {
    const first = await ingestEmail(prisma, input);
    const second = await ingestEmail(prisma, input);
    expect(second).toEqual({
      emailMessageId: first.emailMessageId,
      proposalId: first.proposalId,
      receiptOutboundEmailId: first.receiptOutboundEmailId,
      duplicate: true,
      orchestration: null,
    });
    await expect(prisma.emailMessage.count()).resolves.toBe(1);
    await expect(prisma.proposal.count()).resolves.toBe(1);
    await expect(prisma.order.count()).resolves.toBe(1);
  });

  it("preserves idempotency under concurrent delivery", async () => {
    const results = await Promise.all([ingestEmail(prisma, input), ingestEmail(prisma, input)]);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    await expect(prisma.emailMessage.count()).resolves.toBe(1);
    await expect(prisma.proposal.count()).resolves.toBe(1);
    await expect(prisma.order.count()).resolves.toBe(1);
  });
});
