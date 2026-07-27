"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@cs/db";
import { BATCH_STATUSES, parseServerEnv } from "@cs/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { assertCan } from "@/lib/auth/rbac";
import { AiOrchestrator } from "@/lib/ai/index";
import { addBatch } from "@/lib/orders/batches";
import { createOrder } from "@/lib/orders/create";
import {
  approveOrder,
  markReadyToUpload,
  sendQueryEmail,
  setBatchStatus,
  setOrderEta,
  updateOrderDetails,
} from "@/lib/orders/lifecycle";
import { setCommunicationPaused } from "@/lib/outbound/pause";
import { OutboundPausedError } from "@/lib/outbound/service";
import {
  confirmManualDropAndRetry,
  retryBatchTransfer,
  startBatchTransfer,
} from "@/lib/agent/control";

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
  reason: z.string().trim().max(1000),
});

const optionalNullableQuantity = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}, z.number().int().positive().nullable());

const orderDetailsSchema = z.object({
  orderId: z.uuid(),
  title: z.string().trim().min(1).max(500),
  orderType: z.string().trim().min(1).max(200),
  quantity: optionalNullableQuantity,
  reason: z.string().trim().min(5).max(1000),
});

const approveSchema = z.object({
  orderId: z.uuid(),
  withEta: z.enum(["true", "false"]),
  eta: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }, z.date().optional()),
});

const querySchema = z.object({
  orderId: z.uuid(),
  queryText: z.string().trim().min(3).max(5000),
});

const orderIdSchema = z.object({
  orderId: z.uuid(),
});

const pauseSchema = z.object({
  orderId: z.uuid(),
  paused: z.enum(["true", "false"]),
});

export type OrderActionState = { error: string | null };

const transferControlSchema = z.object({
  orderId: z.uuid(),
  batchId: z.uuid(),
});

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

export async function approveOrderAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = approveSchema.safeParse({
    orderId: formData.get("orderId"),
    withEta: formData.get("withEta"),
    eta: formData.get("eta"),
  });
  if (!parsed.success) return { error: "Choose a valid approval option." };
  if (parsed.data.withEta === "true" && !parsed.data.eta) {
    return { error: "Enter a future ETA to approve with ETA." };
  }

  try {
    await approveOrder(prisma, {
      orderId: parsed.data.orderId,
      ...(parsed.data.withEta === "true" && parsed.data.eta ? { eta: parsed.data.eta } : {}),
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "The order could not be approved in its current state." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/orders");
  revalidatePath("/inbox");
  return { error: null };
}

export async function sendQueryEmailAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = querySchema.safeParse({
    orderId: formData.get("orderId"),
    queryText: formData.get("queryText"),
  });
  if (!parsed.success) return { error: "Enter a query of at least a few characters." };

  const env = parseServerEnv(process.env);
  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { client: true },
  });
  if (!order) return { error: "Order not found." };

  const aiDraft = await AiOrchestrator.draftQueryReply(
    {
      clientDisplayName: order.client.displayName,
      title: order.title,
      orderCode: order.code,
      queryText: parsed.data.queryText,
    },
    AiOrchestrator.aiConfigFromEnv(env),
  );

  try {
    await sendQueryEmail(prisma, {
      orderId: parsed.data.orderId,
      queryText: parsed.data.queryText,
      ...(aiDraft ? { rendered: aiDraft, aiModel: env.OLLAMA_MODEL } : {}),
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch (error) {
    if (error instanceof OutboundPausedError) {
      return { error: "Communication is paused for this order. Resume before sending." };
    }
    return { error: "The query email could not be queued." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/inbox");
  return { error: null };
}

export async function togglePauseAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = pauseSchema.safeParse({
    orderId: formData.get("orderId"),
    paused: formData.get("paused"),
  });
  if (!parsed.success) return { error: "Invalid pause request." };

  try {
    await setCommunicationPaused(prisma, {
      orderId: parsed.data.orderId,
      paused: parsed.data.paused === "true",
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "Pause state could not be changed." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { error: null };
}

export async function markReadyToUploadAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = orderIdSchema.safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) return { error: "Invalid order." };

  try {
    await markReadyToUpload(prisma, {
      orderId: parsed.data.orderId,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "Ready to Upload is only available from In Production." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

export async function updateOrderDetailsAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireOrderWriter();
  const parsed = orderDetailsSchema.safeParse({
    orderId: formData.get("orderId"),
    title: formData.get("title"),
    orderType: formData.get("orderType"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: "Check the title, order type, quantity, and edit reason." };
  }

  try {
    await updateOrderDetails(prisma, {
      orderId: parsed.data.orderId,
      title: parsed.data.title,
      orderType: parsed.data.orderType,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "The order details could not be updated in the current state." };
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
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { error: "Enter a valid future ETA." };
  }

  try {
    await setOrderEta(prisma, {
      orderId: parsed.data.orderId,
      eta: parsed.data.eta,
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
      ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
      actor: {
        userId: user.userId,
        label: user.displayName,
      },
      correlationId: randomUUID(),
    });
  } catch (error) {
    if (error instanceof Error && /reason/i.test(error.message)) {
      return { error: "Changing a locked ETA requires a reason of at least 5 characters." };
    }
    return { error: "The ETA must be in the future for an in-production order." };
  }

  revalidatePath(`/orders/${parsed.data.orderId}`);
  revalidatePath("/orders");
  return { error: null };
}

async function transferControlInput(formData: FormData) {
  const user = await requireOrderWriter();
  const parsed = transferControlSchema.safeParse({
    orderId: formData.get("orderId"),
    batchId: formData.get("batchId"),
  });
  return { user, parsed };
}

export async function startTransferAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const { user, parsed } = await transferControlInput(formData);
  if (!parsed.success) return { error: "The transfer request is invalid." };
  try {
    await startBatchTransfer(prisma, {
      batchId: parsed.data.batchId,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "Only a new pending batch can be started." };
  }
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { error: null };
}

export async function retryTransferAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const { user, parsed } = await transferControlInput(formData);
  if (!parsed.success) return { error: "The retry request is invalid." };
  try {
    await retryBatchTransfer(prisma, {
      batchId: parsed.data.batchId,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
    });
  } catch {
    return { error: "Only a failed batch can be retried." };
  }
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { error: null };
}

export async function confirmManualDropAction(
  _previous: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const { user, parsed } = await transferControlInput(formData);
  if (!parsed.success) return { error: "The manual-drop request is invalid." };
  try {
    const env = parseServerEnv(process.env);
    await confirmManualDropAndRetry(prisma, {
      batchId: parsed.data.batchId,
      actor: { userId: user.userId, label: user.displayName },
      correlationId: randomUUID(),
      stagingRoot: env.STAGING_ROOT,
    });
  } catch {
    return { error: "Manual drop can be confirmed only after a permanent download failure." };
  }
  revalidatePath(`/orders/${parsed.data.orderId}`);
  return { error: null };
}
