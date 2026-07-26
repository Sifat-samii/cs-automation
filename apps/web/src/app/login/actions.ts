"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@cs/db";
import { hashPassword, parseServerEnv, verifyPassword } from "@cs/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { createSession, invalidateSession } from "@/lib/auth/session";

const credentials = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(1024),
});

export type SignInState = { error: string | null };

// Hashing a throwaway password when the account does not exist keeps the
// response time constant, so the form cannot be used to enumerate accounts.
const DUMMY_HASH_PROMISE = hashPassword("account-enumeration-guard");

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const env = parseServerEnv(process.env);
  const parsed = credentials.safeParse({
    loginId: formData.get("loginId"),
    password: formData.get("password"),
  });

  if (!parsed.success) return { error: "Enter your ID and password." };

  const correlationId = randomUUID();
  const user = await prisma.user.findUnique({ where: { loginId: parsed.data.loginId } });

  if (!user || !user.isActive) {
    await verifyPassword(await DUMMY_HASH_PROMISE, parsed.data.password);
    await recordAudit(prisma, {
      correlationId,
      actorUserId: null,
      actorLabel: parsed.data.loginId,
      action: "user.sign_in_failed",
      entityType: "User",
      entityId: parsed.data.loginId,
      metadata: { reason: "unknown_or_inactive" },
    });
    return { error: "Those credentials are not valid." };
  }

  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    await recordAudit(prisma, {
      correlationId,
      actorUserId: user.id,
      actorLabel: user.loginId,
      action: "user.sign_in_failed",
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "bad_password" },
    });
    return { error: "Those credentials are not valid." };
  }

  const { token, expiresAt } = await createSession(prisma, {
    userId: user.id,
    ttlHours: env.SESSION_TTL_HOURS,
  });

  await recordAudit(prisma, {
    correlationId,
    actorUserId: user.id,
    actorLabel: user.loginId,
    action: "user.signed_in",
    entityType: "User",
    entityId: user.id,
  });

  (await cookies()).set(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    path: "/",
    expires: expiresAt,
  });

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const env = parseServerEnv(process.env);
  const store = await cookies();
  const token = store.get(env.SESSION_COOKIE_NAME)?.value;

  if (token) await invalidateSession(prisma, token);
  store.delete(env.SESSION_COOKIE_NAME);

  redirect("/login");
}
