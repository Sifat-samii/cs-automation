import { prisma } from "@cs/db";
import { parseServerEnv } from "@cs/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSessionToken, type SessionUser } from "./session";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const env = parseServerEnv(process.env);
  const token = (await cookies()).get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSessionToken(prisma, token);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
