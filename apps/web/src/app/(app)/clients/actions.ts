"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@cs/db";
import { parseServerEnv } from "@cs/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
import { createClient } from "@/lib/clients/service";

const clientFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,12}$/u),
  displayName: z.string().trim().min(1).max(200),
  address: z.string().trim().max(320),
  domain: z.string().trim().max(253),
});

export type ClientActionState = { error: string | null };

export async function createClientAction(
  _previous: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const user = await requireUser();
  assertCan(user.role, "client:manage");
  const env = parseServerEnv(process.env);

  const parsed = clientFormSchema.safeParse({
    code: formData.get("code"),
    displayName: formData.get("displayName"),
    address: formData.get("address") ?? "",
    domain: formData.get("domain") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the client details and try again." };
  }

  const identities = [
    ...(parsed.data.address ? [{ kind: "ADDRESS" as const, value: parsed.data.address }] : []),
    ...(parsed.data.domain ? [{ kind: "DOMAIN" as const, value: parsed.data.domain }] : []),
  ];

  try {
    await createClient(prisma, {
      code: parsed.data.code,
      displayName: parsed.data.displayName,
      identities,
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch {
    return {
      error:
        "The client could not be created. Check for an existing code or identity, and share folder access.",
    };
  }

  revalidatePath("/clients");
  redirect("/clients");
}
