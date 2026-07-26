import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { signRequest } from "@cs/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ingest/email/route";
import { AGENT_SIGNATURE_HEADER, AGENT_TIMESTAMP_HEADER } from "@/lib/agent/http";
import { resetIngestRateLimitsForTesting } from "@/lib/ingest/rate-limit";

const secret = "0123456789abcdef0123456789abcdef";
const bodyValue = {
  gmailMessageId: "gmail-message-1",
  gmailThreadId: "gmail-thread-1",
  fromAddress: "unknown@example.com",
  toAddresses: ["cs@example.test"],
  subject: "New request",
  bodyText: "Attached files",
  receivedAt: "2026-07-26T12:00:00.000Z",
  attachments: [{ filename: "files.zip", sizeBytes: 42 }],
};

function signedRequest(
  value: typeof bodyValue,
  options: { timestamp?: string; idempotencyKey?: string; caller?: string } = {},
): Request {
  const body = JSON.stringify(value);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1_000));
  return new Request("http://localhost/api/ingest/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": options.idempotencyKey ?? value.gmailMessageId,
      "x-forwarded-for": options.caller ?? "127.0.0.1",
      [AGENT_TIMESTAMP_HEADER]: timestamp,
      [AGENT_SIGNATURE_HEADER]: signRequest({ secret, timestamp, body }),
    },
    body,
  });
}

describe("HMAC email ingest route", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
    resetIngestRateLimitsForTesting();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts a signed ingest and returns the same ids on replay", async () => {
    const first = await POST(signedRequest(bodyValue));
    const second = await POST(signedRequest(bodyValue));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { emailMessageId: string; proposalId: string };
    await expect(second.json()).resolves.toMatchObject({
      ...firstBody,
      duplicate: true,
    });
    await expect(prisma.emailMessage.count()).resolves.toBe(1);
    await expect(prisma.proposal.count()).resolves.toBe(1);
  });

  it("rejects unsigned, stale, and mismatched idempotency requests", async () => {
    const unsigned = new Request("http://localhost/api/ingest/email", {
      method: "POST",
      body: JSON.stringify(bodyValue),
    });
    expect((await POST(unsigned)).status).toBe(401);

    const stale = String(Math.floor(Date.now() / 1_000) - 301);
    expect((await POST(signedRequest(bodyValue, { timestamp: stale }))).status).toBe(401);
    expect(
      (await POST(signedRequest(bodyValue, { idempotencyKey: "different-message" }))).status,
    ).toBe(400);
  });

  it("rate limits a signed caller after the documented burst allowance", async () => {
    for (let index = 0; index < 60; index += 1) {
      const value = {
        ...bodyValue,
        gmailMessageId: `gmail-message-${index}`,
      };
      const response = await POST(signedRequest(value));
      expect(response.status).toBe(201);
    }
    const limited = await POST(
      signedRequest({ ...bodyValue, gmailMessageId: "gmail-message-over-limit" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });
});
