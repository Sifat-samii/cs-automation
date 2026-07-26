import { describe, expect, it } from "vitest";
import { signRequest, verifyRequest } from "./hmac.js";

const secret = "0123456789abcdef0123456789abcdef";
const body = JSON.stringify({ gmailMessageId: "abc123" });
const now = new Date("2026-07-26T00:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));

describe("signRequest", () => {
  it("produces a stable lowercase hex digest", () => {
    const signature = signRequest({ secret, timestamp, body });
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signRequest({ secret, timestamp, body })).toBe(signature);
  });

  it("produces a different digest for a different body", () => {
    const a = signRequest({ secret, timestamp, body });
    const b = signRequest({ secret, timestamp, body: body + " " });
    expect(a).not.toBe(b);
  });
});

describe("verifyRequest", () => {
  it("accepts a correctly signed request", () => {
    const signature = signRequest({ secret, timestamp, body });
    expect(verifyRequest({ secret, timestamp, body, signature, now })).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const signature = signRequest({ secret, timestamp, body });
    const result = verifyRequest({
      secret,
      timestamp,
      body: '{"gmailMessageId":"evil"}',
      signature,
      now,
    });
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects a signature made with a different secret", () => {
    const signature = signRequest({ secret: "f".repeat(32), timestamp, body });
    expect(verifyRequest({ secret, timestamp, body, signature, now })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a timestamp outside the replay window", () => {
    const old = String(Math.floor(now.getTime() / 1000) - 400);
    const signature = signRequest({ secret, timestamp: old, body });
    expect(verifyRequest({ secret, timestamp: old, body, signature, now })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects a future timestamp outside the window", () => {
    const future = String(Math.floor(now.getTime() / 1000) + 400);
    const signature = signRequest({ secret, timestamp: future, body });
    expect(verifyRequest({ secret, timestamp: future, body, signature, now })).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifyRequest({ secret, timestamp, body, signature: "nothex", now })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects a non-numeric timestamp", () => {
    expect(
      verifyRequest({
        secret,
        timestamp: "yesterday",
        body,
        signature: "a".repeat(64),
        now,
      }),
    ).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
