import type { PrismaClient } from "@cs/db";
import type { OrderMutationActor } from "@/lib/orders/create";

/** Stable system user used for automated order creation at ingest. */
export const SYSTEM_INGEST_USER_ID = "00000000-0000-4000-8000-000000000001";
export const SYSTEM_INGEST_LOGIN_ID = "system-ingest";
export const SYSTEM_INGEST_LABEL = "System Ingest";

export async function ensureSystemIngestActor(db: PrismaClient): Promise<OrderMutationActor> {
  const existing = await db.user.findUnique({
    where: { loginId: SYSTEM_INGEST_LOGIN_ID },
    select: { id: true, displayName: true },
  });
  if (existing) {
    return { userId: existing.id, label: existing.displayName };
  }

  try {
    const created = await db.user.create({
      data: {
        id: SYSTEM_INGEST_USER_ID,
        loginId: SYSTEM_INGEST_LOGIN_ID,
        displayName: SYSTEM_INGEST_LABEL,
        passwordHash: "system-ingest-not-a-login",
        role: "CS_LEAD",
        isActive: true,
      },
      select: { id: true, displayName: true },
    });
    return { userId: created.id, label: created.displayName };
  } catch {
    const raced = await db.user.findUniqueOrThrow({
      where: { loginId: SYSTEM_INGEST_LOGIN_ID },
      select: { id: true, displayName: true },
    });
    return { userId: raced.id, label: raced.displayName };
  }
}
