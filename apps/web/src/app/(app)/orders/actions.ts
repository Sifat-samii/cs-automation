"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@cs/db";
import { BATCH_STATUSES, ORDER_STATUSES, parseServerEnv } from "@cs/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
import { addBatch } from "@/lib/orders/batches";
import { createOrder } from "@/lib/orders/create";
import { setBatchStatus, setEta, setOrderStatus } from "@/lib/orders/lifecycle";

const optionalPositiveInteger = z.preprocess(
  (value) => (value === "" || value === null ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

const optionalSourceKind = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.enum(["DROPBOX", "GDRIVE", "ATTACHMENT", "MANUAL_DROP", "OTHER"]).optional(),
);

const orderFormSchema = z.object({
  clientId: z.uuid(),
  title: z.string().trim().min(1).max(500),
  orderType: z.string().trim().min(1).max(200),
  quantity: optionalPositiveInteger,
  sourceKind: optionalSourceKind,
  sourceUrl: z.string().trim().max(2048),
  sourceLocalHint: z.string().trim().max(500),
});

const batchFormSchema = z.object({
  orderId: z.uuid(),
  kind: z.enum(["ADDITIONAL", "SAMPLE", "CORRECTION"]),
  notes: z.string().trim().max(1000),
  sourceKind: optionalSourceKind,
  sourceUrl: z.string().trim().max(2048),
  sourceLocalHint: z.string().trim().max(500),
});

const orderStatusSchema = z.object({
  orderId: z.uuid(),
  status: z.enum(ORDER_STATUSES),
  cancelReason: z.string().trim().max(1000),
});

const batchStatusSchema = z.object({
  orderId: z.uuid(),
  batchId: z.uuid(),
  status: z.enum(BATCH_STATUSES),
  failureReason: z.string().trim().max(1000),
});

const etaSchema = z.object({
  orderId: z.uuid(),
  eta: z.coerce.date(),
  note: z.string().trim().max(1000),
});

export type OrderActionState = { error: string | null };

async function requireOrderWriter() {
  const user = await requireUser();
  assertCan(user.role, "order:write");
  return user;
}

function sourceLinksFromForm(data: {
  sourceKind?: "DROPBOX" | "GDRIVE" | "ATTACHMENT" | "MANUAL_DROP" | "OTHER";
  sourceUrl: string;
  sourceLocalHint: string;
}) {
  return data.sourceKind
    ? [
        {
          kind: data.sourceKind,
          ...(data.sourceUrl ? { url: data.sourceUrl } : {}),
          ...(data.sourceLocalHint ? { localHint: data.sourceLocalHint } : {}),
        },
      ]
    : [];
}

export async function createOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = orderFormSchema.safeParse({
    clientId: formData.get("clientId"),
    title: formData.get("title"),
    orderType: formData.get("orderType"),
    quantity: formData.get("quantity"),
    sourceKind: formData.get("sourceKind"),
    sourceUrl: formData.get("sourceUrl") ?? "",
    sourceLocalHint: formData.get("sourceLocalHint") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the order details and try again." };
  }
  const env = parseServerEnv(process.env);

  let orderId: string;
  try {
    const order = await createOrder(prisma, {
      clientId: parsed.data.clientId,
      title: parsed.data.title,
      orderType: parsed.data.orderType,
      ...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
      sourceLinks: sourceLinksFromForm(parsed.data),
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
      backupRoot: env.BACKUP_ROOT_UNC,
      productionRoot: env.PRODUCTION_ROOT_UNC,
    });
    orderId = order.id;
  } catch {
    return {
      error: "The order could not be created. Check the title, source, client, and path length.",
    };
  }

  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function addBatchAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = batchFormSchema.safeParse({
    orderId: formData.get("orderId"),
    kind: formData.get("kind"),
    notes: formData.get("notes") ?? "",
    sourceKind: formData.get("sourceKind"),
    sourceUrl: formData.get("sourceUrl") ?? "",
    sourceLocalHint: formData.get("sourceLocalHint") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the batch details and try again." };
  }

  try {
    await addBatch(prisma, {
      orderId: parsed.data.orderId,
      kind: parsed.data.kind,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      sourceLinks: sourceLinksFromForm(parsed.data),
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "The batch could not be added in the order's current state." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { error: null };
}

export async function setOrderStatusAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = orderStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    cancelReason: formData.get("cancelReason") ?? "",
  });
  if (!parsed.success) {
    return { error: "Choose a valid next order status." };
  }

  try {
    await setOrderStatus(prisma, {
      orderId: parsed.data.orderId,
      status: parsed.data.status,
      ...(parsed.data.cancelReason ? { cancelReason: parsed.data.cancelReason } : {}),
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "That order status change is not allowed." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

export async function setBatchStatusAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = batchStatusSchema.safeParse({
    orderId: formData.get("orderId"),
    batchId: formData.get("batchId"),
    status: formData.get("status"),
    failureReason: formData.get("failureReason") ?? "",
  });
  if (!parsed.success) {
    return { error: "Choose a valid next batch status." };
  }

  try {
    await setBatchStatus(prisma, {
      batchId: parsed.data.batchId,
      status: parsed.data.status,
      ...(parsed.data.failureReason ? { failureReason: parsed.data.failureReason } : {}),
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "That batch status change is not allowed." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { error: null };
}

export async function setEtaAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = etaSchema.safeParse({
    orderId: formData.get("orderId"),
    eta: formData.get("eta"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return { error: "Enter a valid future ETA." };
  }

  try {
    await setEta(prisma, {
      orderId: parsed.data.orderId,
      eta: parsed.data.eta,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "The ETA must be in the future for an active order." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/orders");
  return { error: null };
}
