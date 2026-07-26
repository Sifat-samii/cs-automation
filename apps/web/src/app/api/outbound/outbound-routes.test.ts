import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { signRequest } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST as sentRoute } from "@/app/api/outbound/[id]/sent/route";
import { GET as pendingRoute } from "@/app/api/outbound/pending/route";
import { AGENT_SIGNATURE_HEADER, AGENT_TIMESTAMP_HEADER } from "@/lib/agent/http";

const secret = "0123456789abcdef0123456789abcdef";
const actorUserId = "11111111-1111-4111-8111-111111111111";

function signedRequest(url: string, method: "GET" | "POST", value?: unknown): Request {
  const body = value === undefined ? "" : JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  return new Request(url, {
    method,
    headers: {
      ...(value === undefined ? {} : { "content-type": "application/json" }),
      [AGENT_TIMESTAMP_HEADER]: timestamp,
      [AGENT_SIGNATURE_HEADER]: signRequest({ secret, timestamp, body }),
    },
    ...(value === undefined ? {} : { body }),
  });
}

async function createFixtures(): Promise<{ draftId: string; approvedId: string }> {
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
  const draft = await prisma.outboundEmail.create({
    data: {
      orderId: order.id,
      template: "ACKNOWLEDGEMENT",
      renderedSubject: "Draft",
      renderedBody: "Draft",
      idempotencyKey: "draft",
      gmailThreadId: "gmail-thread-1",
    },
  });
  const approved = await prisma.outboundEmail.create({
    data: {
      orderId: order.id,
      template: "FILES_VERIFIED",
      renderedSubject: "Approved",
      renderedBody: "Approved",
      status: "APPROVED",
      approvedById: actorUserId,
      approvedAt: new Date("2026-07-26T13:00:00.000Z"),
      idempotencyKey: "approved",
      gmailThreadId: "gmail-thread-1",
    },
  });
  return { draftId: draft.id, approvedId: approved.id };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("HMAC outbound queue routes", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects browser authority and returns only approved rows to a signed caller", async () => {
    const fixtures = await createFixtures();
    const unsigned = await pendingRoute(
      new Request("http://localhost/api/outbound/pending", {
        headers: { cookie: "cs_session=browser" },
      }),
    );
    expect(unsigned.status).toBe(401);

    const response = await pendingRoute(
      signedRequest("http://localhost/api/outbound/pending", "GET"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { outbound: Array<{ id: string }> };
    expect(body.outbound).toEqual([expect.objectContaining({ id: fixtures.approvedId })]);
    expect(body.outbound).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: fixtures.draftId })]),
    );
  });

  it("cannot mark a draft sent and marks approved delivery idempotently", async () => {
    const fixtures = await createFixtures();
    const draft = await sentRoute(
      signedRequest(`http://localhost/api/outbound/${fixtures.draftId}/sent`, "POST", {
        sentMessageId: "sent-message-1",
      }),
      params(fixtures.draftId),
    );
    expect(draft.status).toBe(409);

    const pending = await pendingRoute(
      signedRequest("http://localhost/api/outbound/pending", "GET"),
    );
    expect(pending.status).toBe(200);
    const first = await sentRoute(
      signedRequest(`http://localhost/api/outbound/${fixtures.approvedId}/sent`, "POST", {
        sentMessageId: "sent-message-1",
      }),
      params(fixtures.approvedId),
    );
    const replay = await sentRoute(
      signedRequest(`http://localhost/api/outbound/${fixtures.approvedId}/sent`, "POST", {
        sentMessageId: "sent-message-1",
      }),
      params(fixtures.approvedId),
    );
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    await expect(
      prisma.outboundEmail.findUniqueOrThrow({ where: { id: fixtures.approvedId } }),
    ).resolves.toMatchObject({ status: "SENT", sentMessageId: "sent-message-1" });
  });
});
