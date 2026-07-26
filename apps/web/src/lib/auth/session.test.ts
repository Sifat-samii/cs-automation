import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@cs/db";
import { resetDatabase } from "@cs/db/testing";
import { hashPassword } from "@cs/shared";
import {
  createSession,
  generateSessionToken,
  hashSessionToken,
  invalidateAllSessionsForUser,
  invalidateSession,
  validateSessionToken,
} from "./session";

const now = new Date("2026-07-26T00:00:00.000Z");

async function makeUser() {
  return prisma.user.create({
    data: {
      email: "exec@example.com",
      displayName: "Test Executive",
      passwordHash: await hashPassword("a-long-enough-password"),
      role: "CS_EXECUTIVE",
    },
  });
}

describe("session management", () => {
  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("generates distinct high-entropy tokens", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it("never stores the raw token", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(rows[0]?.tokenHash).not.toBe(token);
  });

  it("resolves a valid token to its user", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    const resolved = await validateSessionToken(prisma, token, now);
    expect(resolved).toEqual({
      userId: user.id,
      email: "exec@example.com",
      displayName: "Test Executive",
      role: "CS_EXECUTIVE",
    });
  });

  it("rejects an unknown token", async () => {
    await expect(validateSessionToken(prisma, generateSessionToken(), now)).resolves.toBeNull();
  });

  it("rejects an expired session and removes it", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    const later = new Date(now.getTime() + 13 * 60 * 60 * 1000);
    await expect(validateSessionToken(prisma, token, later)).resolves.toBeNull();
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("rejects a session belonging to a deactivated user", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(validateSessionToken(prisma, token, now)).resolves.toBeNull();
  });

  it("invalidates a single session", async () => {
    const user = await makeUser();
    const { token } = await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await invalidateSession(prisma, token);
    await expect(validateSessionToken(prisma, token, now)).resolves.toBeNull();
  });

  it("invalidates every session for a user", async () => {
    const user = await makeUser();
    await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await invalidateAllSessionsForUser(prisma, user.id);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("removes sessions when the user is deleted", async () => {
    const user = await makeUser();
    await createSession(prisma, { userId: user.id, ttlHours: 12, now });
    await prisma.user.delete({ where: { id: user.id } });
    await expect(prisma.session.count()).resolves.toBe(0);
  });
});
