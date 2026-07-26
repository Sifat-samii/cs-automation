"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@cs/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
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

const approvalSchema = z.object({
  proposalId: z.uuid(),
  clientId: optionalUuid,
  targetOrderId: optionalUuid,
  title: optionalText(500),
  orderType: optionalText(200),
  quantity: optionalPositiveInteger,
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
