"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@cs/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deriveClientCode, parseServerEnv } from "@cs/shared";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
import { createClient } from "@/lib/clients/service";
import { approveProposal, ignoreEmail } from "@/lib/ingest/approve";

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.uuid().optional(),
);
const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === null ? undefined : Number(value)),
  z.number().int().positive().optional(),
);
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().trim().min(1).max(maximum).optional(),
  );
const optionalUrl = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.url().optional(),
);
const optionalEta = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}, z.date().optional());

const approvalSchema = z.object({
  proposalId: z.uuid(),
  clientId: optionalUuid,
  targetOrderId: optionalUuid,
  title: optionalText(500),
  orderType: optionalText(200),
  quantity: optionalPositiveInteger,
  downloadUrl: optionalUrl,
  eta: optionalEta,
  batchKind: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.enum(["ADDITIONAL", "SAMPLE", "CORRECTION"]).optional(),
  ),
});

const ignoreSchema = z.object({
  emailMessageId: z.uuid(),
});

export type InboxActionState = { error: string | null };

async function requireInboxWriter() {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  return user;
}

export async function approveProposalAction(
  _previous: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await requireInboxWriter();
  const parsed = approvalSchema.safeParse({
    proposalId: formData.get("proposalId"),
    clientId: formData.get("clientId"),
    targetOrderId: formData.get("targetOrderId"),
    title: formData.get("title"),
    orderType: formData.get("orderType"),
    quantity: formData.get("quantity"),
    downloadUrl: formData.get("downloadUrl"),
    eta: formData.get("eta"),
    batchKind: formData.get("batchKind"),
  });
  if (!parsed.success) return { error: "Review the proposed fields and try again." };

  let result;
  try {
    result = await approveProposal(prisma, {
      proposalId: parsed.data.proposalId,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
      overrides: {
        ...(parsed.data.clientId ? { clientId: parsed.data.clientId } : {}),
        ...(parsed.data.targetOrderId ? { targetOrderId: parsed.data.targetOrderId } : {}),
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.orderType ? { orderType: parsed.data.orderType } : {}),
        ...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
        ...(parsed.data.batchKind ? { batchKind: parsed.data.batchKind } : {}),
        ...(parsed.data.downloadUrl ? { downloadUrl: parsed.data.downloadUrl } : {}),
        ...(parsed.data.eta ? { eta: parsed.data.eta } : {}),
      },
    });
  } catch {
    return {
      error:
        "The proposal could not be approved. Confirm the client, target order, fields, and current status.",
    };
  }

  revalidatePath("/inbox");
  revalidatePath("/orders");
  if (result.orderId) redirect(`/orders/${result.orderId}`);
  redirect("/inbox");
}

export async function ignoreEmailAction(
  _previous: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const user = await requireInboxWriter();
  const parsed = ignoreSchema.safeParse({
    emailMessageId: formData.get("emailMessageId"),
  });
  if (!parsed.success) return { error: "The email selection is invalid." };
  try {
    await ignoreEmail(prisma, {
      emailMessageId: parsed.data.emailMessageId,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "The email is no longer available for review." };
  }
  revalidatePath("/inbox");
  redirect("/inbox");
}

const inboxClientSchema = z.object({
  emailMessageId: z.uuid(),
  displayName: z.string().trim().min(1).max(200),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,12}$/u)
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(320).optional().or(z.literal("")),
});

export type InboxClientActionState = { error: string | null; clientId?: string };

export async function createClientFromInboxAction(
  _previous: InboxClientActionState,
  formData: FormData,
): Promise<InboxClientActionState> {
  const user = await requireUser();
  assertCan(user.role, "client:manage");
  const env = parseServerEnv(process.env);

  const parsed = inboxClientSchema.safeParse({
    emailMessageId: formData.get("emailMessageId"),
    displayName: formData.get("displayName"),
    code: formData.get("code") ?? "",
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the client details and try again." };
  }

  const code =
    parsed.data.code && parsed.data.code.length > 0
      ? parsed.data.code.toUpperCase()
      : deriveClientCode(parsed.data.displayName);
  const address =
    parsed.data.address && parsed.data.address.length > 0 ? parsed.data.address : undefined;

  let client;
  try {
    client = await createClient(prisma, {
      code,
      displayName: parsed.data.displayName,
      identities: address ? [{ kind: "ADDRESS", value: address }] : [],
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return {
      error:
        "The client could not be created. Check for an existing code or identity, and share folder access.",
    };
  }

  revalidatePath("/clients");
  revalidatePath("/inbox");
  revalidatePath(`/inbox/${parsed.data.emailMessageId}`);
  redirect(`/inbox/${parsed.data.emailMessageId}?clientId=${client.id}`);
}
