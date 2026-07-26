import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 300;
const HEX_SIGNATURE = /^[0-9a-f]{64}$/;

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "stale" | "mismatch" };

export function signRequest(input: { secret: string; timestamp: string; body: string }): string {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`, "utf8")
    .digest("hex");
}

export function verifyRequest(input: {
  secret: string;
  timestamp: string;
  body: string;
  signature: string;
  toleranceSeconds?: number;
  now?: Date;
}): VerifyResult {
  const { secret, timestamp, body, signature } = input;
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = input.now ?? new Date();

  if (!HEX_SIGNATURE.test(signature)) return { ok: false, reason: "malformed" };

  const sent = Number(timestamp);
  if (!Number.isInteger(sent)) return { ok: false, reason: "malformed" };

  const skew = Math.abs(Math.floor(now.getTime() / 1000) - sent);
  if (skew > tolerance) return { ok: false, reason: "stale" };

  const expected = Buffer.from(signRequest({ secret, timestamp, body }), "hex");
  const provided = Buffer.from(signature, "hex");
  if (expected.length !== provided.length) return { ok: false, reason: "malformed" };

  return timingSafeEqual(expected, provided) ? { ok: true } : { ok: false, reason: "mismatch" };
}
