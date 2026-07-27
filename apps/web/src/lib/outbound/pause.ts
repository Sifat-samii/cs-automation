import type { DbClient, PrismaClient } from "@cs/db";
import { recordAudit } from "@/lib/audit";
import type { OrderMutationActor } from "@/lib/orders/create";

export async function isCommunicationPaused(
  db: DbClient,
  input: { gmailThreadId: string },
): Promise<boolean> {
  const threadId = input.gmailThreadId.trim();
  if (!threadId) return false;

  const [thread, order] = await Promise.all([
    db.mailThreadState.findUnique({
      where: { gmailThreadId: threadId },
      select: { paused: true },
    }),
    db.order.findFirst({
      where: { gmailThreadId: threadId, communicationPaused: true },
      select: { communicationPaused: true },
    }),
  ]);

  return Boolean(thread?.paused || order?.communicationPaused);
}

export type SetCommunicationPausedInput = {
  orderId: string;
  paused: boolean;
  actor: OrderMutationActor;
  correlationId: string;
  now?: Date;
};

export async function setCommunicationPaused(db: PrismaClient, input: SetCommunicationPausedInput) {
  const now = input.now ?? new Date();
  return db.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        gmailThreadId: true,
        communicationPaused: true,
        status: true,
      },
    });
    if (!order) throw new Error("Order does not exist");
    if (order.status === "READY_TO_UPLOAD") {
      throw new Error("Cannot change communication pause on a ready-to-upload order");
    }
    if (order.communicationPaused === input.paused) {
      return transaction.order.findUniqueOrThrow({ where: { id: order.id } });
    }

    const updated = await transaction.order.update({
      where: { id: order.id },
      data: { communicationPaused: input.paused },
    });

    if (order.gmailThreadId) {
      await transaction.mailThreadState.upsert({
        where: { gmailThreadId: order.gmailThreadId },
        create: {
          gmailThreadId: order.gmailThreadId,
          paused: input.paused,
          pausedById: input.actor.userId,
          pausedAt: input.paused ? now : null,
          resumedAt: input.paused ? null : now,
        },
        update: {
          paused: input.paused,
          pausedById: input.actor.userId,
          ...(input.paused ? { pausedAt: now, resumedAt: null } : { resumedAt: now }),
        },
      });
    }

    const eventType = input.paused ? "order.communication_paused" : "order.communication_resumed";
    await transaction.orderEvent.create({
      data: {
        orderId: order.id,
        type: eventType,
        payload: { paused: input.paused, gmailThreadId: order.gmailThreadId },
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        correlationId: input.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: eventType,
      entityType: "Order",
      entityId: order.id,
      metadata: { paused: input.paused, gmailThreadId: order.gmailThreadId },
    });

    return updated;
  });
}
