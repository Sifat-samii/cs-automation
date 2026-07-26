import { createHash, randomBytes } from "node:crypto";
import type { DbClient, UserRole } from "@cs/db";

export type SessionUser = {
  userId: string;
  loginId: string;
  displayName: string;
  role: UserRole;
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSession(
  db: DbClient,
  input: { userId: string; ttlHours: number; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + input.ttlHours * 60 * 60 * 1000);

  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId: input.userId,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    },
  });

  return { token, expiresAt };
}

export async function validateSessionToken(
  db: DbClient,
  token: string,
  now: Date = new Date(),
): Promise<SessionUser | null> {
  const tokenHash = hashSessionToken(token);

  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt <= now) {
    await db.session.delete({ where: { tokenHash } });
    return null;
  }

  if (!session.user.isActive) return null;

  await db.session.update({ where: { tokenHash }, data: { lastSeenAt: now } });

  return {
    userId: session.user.id,
    loginId: session.user.loginId,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function invalidateSession(db: DbClient, token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export async function invalidateAllSessionsForUser(db: DbClient, userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}
