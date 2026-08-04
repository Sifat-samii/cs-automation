import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@cs/db";
import { parseServerEnv } from "@cs/shared";
import { AiOrchestrator, type ClassificationResult } from "@/lib/ai/index";
import { queueBatchTransfer } from "@/lib/agent/pipeline";
import { recordAudit } from "@/lib/audit";
import { addBatchInTransaction } from "@/lib/orders/batches";
import { createOrderInTransaction, type SourceLinkInput } from "@/lib/orders/create";
import { isCommunicationPaused } from "@/lib/outbound/pause";
import { draftAndSystemApproveOutbound, OutboundPausedError } from "@/lib/outbound/service";
import { ensureSystemIngestActor } from "@/lib/system-actor";

export type OrchestrateInboundResult = {
  paused: boolean;
  skippedReason: string | null;
  orderId: string | null;
  batchId: string | null;
  conversationOutboundId: string | null;
  classification: ClassificationResult | null;
};

function sourceLinksFromUrls(dropboxUrls: string[], driveUrls: string[]): SourceLinkInput[] {
  return [
    ...dropboxUrls.map((url) => ({ kind: "DROPBOX" as const, url })),
    ...driveUrls.map((url) => ({ kind: "GDRIVE" as const, url })),
  ];
}

async function countRecentAutoReplies(db: PrismaClient, gmailThreadId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db.outboundEmail.count({
    where: {
      gmailThreadId,
      template: { in: ["CONVERSATION_REPLY", "QUERY_REPLY"] },
      createdAt: { gte: since },
      status: { in: ["APPROVED", "SENDING", "SENT"] },
    },
  });
}

export async function orchestrateInboundEmail(
  db: PrismaClient,
  input: {
    emailMessageId: string;
    proposalId: string;
    correlationId?: string;
  },
): Promise<OrchestrateInboundResult> {
  const correlationId = input.correlationId ?? randomUUID();
  const env = parseServerEnv(process.env);
  const aiConfig = AiOrchestrator.aiConfigFromEnv(env);

  const email = await db.emailMessage.findUnique({
    where: { id: input.emailMessageId },
    include: {
      proposals: { where: { id: input.proposalId }, take: 1 },
      client: { select: { id: true, displayName: true } },
    },
  });
  if (!email) {
    return {
      paused: false,
      skippedReason: "email_missing",
      orderId: null,
      batchId: null,
      conversationOutboundId: null,
      classification: null,
    };
  }

  const empty: OrchestrateInboundResult = {
    paused: false,
    skippedReason: null,
    orderId: email.orderId,
    batchId: null,
    conversationOutboundId: null,
    classification: null,
  };

  if (await isCommunicationPaused(db, { gmailThreadId: email.gmailThreadId })) {
    return { ...empty, paused: true, skippedReason: "paused" };
  }

  if (
    env.CS_MAILBOX_ADDRESS &&
    email.fromAddress.toLowerCase() === env.CS_MAILBOX_ADDRESS.toLowerCase()
  ) {
    return { ...empty, skippedReason: "self_address" };
  }

  const autoReplies = await countRecentAutoReplies(db, email.gmailThreadId);
  if (autoReplies >= env.AI_MAX_THREAD_AUTO_REPLIES_24H) {
    await db.proposal.updateMany({
      where: { id: input.proposalId, status: "PENDING" },
      data: { kind: "NEEDS_HUMAN" },
    });
    await recordAudit(db, {
      correlationId,
      actorUserId: null,
      actorLabel: "System Ingest",
      action: "email.auto_reply_capped",
      entityType: "EmailMessage",
      entityId: email.id,
      metadata: { autoReplies, cap: env.AI_MAX_THREAD_AUTO_REPLIES_24H },
    });
    return { ...empty, skippedReason: "auto_reply_cap" };
  }

  const proposal = email.proposals[0];
  const payload = (proposal?.payload ?? {}) as {
    dropboxUrls?: string[];
    driveUrls?: string[];
    title?: string;
    orderType?: string;
    clientId?: string | null;
    orderId?: string | null;
  };
  const dropboxUrls = payload.dropboxUrls ?? [];
  const driveUrls = payload.driveUrls ?? [];
  const hasLinks = dropboxUrls.length + driveUrls.length > 0;
  const clientKnown = Boolean(email.clientId ?? payload.clientId);

  let classification: ClassificationResult | null = null;
  if (aiConfig.enabled) {
    classification = await AiOrchestrator.classifyInboundEmail(
      {
        subject: email.subject,
        bodyText: email.bodyText,
        hasLinks,
        clientKnown,
      },
      aiConfig,
    );
    if (!classification) {
      if (hasLinks && clientKnown) {
        // Never guess ORDER on AI failure when links exist — escalate to human.
        await db.proposal.updateMany({
          where: { id: input.proposalId, status: "PENDING" },
          data: { kind: "NEEDS_HUMAN" },
        });
        await recordAudit(db, {
          correlationId,
          actorUserId: null,
          actorLabel: "System Ingest",
          action: "email.classification_failed",
          entityType: "EmailMessage",
          entityId: email.id,
          metadata: { hasLinks, clientKnown },
        });
        return {
          ...empty,
          skippedReason: "classification_failed_needs_human",
          classification: null,
        };
      }
      classification = AiOrchestrator.classifyDeterministic({ hasLinks, clientKnown });
    }
  } else {
    classification = AiOrchestrator.classifyDeterministic({ hasLinks, clientKnown });
  }

  const isOrderPath = classification.intent === "ORDER" && hasLinks && clientKnown;

  if (isOrderPath) {
    try {
      const actor = await ensureSystemIngestActor(db);
      const result = await db.$transaction(async (transaction) => {
        const sources = sourceLinksFromUrls(dropboxUrls, driveUrls);
        let orderId = payload.orderId ?? email.orderId;
        let batchId: string | null = null;

        if (orderId) {
          const batch = await addBatchInTransaction(transaction, {
            orderId,
            kind: "ADDITIONAL",
            notes: `Email intake ${email.gmailMessageId}`,
            sourceLinks: sources,
            actor,
            correlationId,
          });
          batchId = batch.id;
        } else {
          const creationDay = new Date().toISOString().slice(0, 10);
          const clientId = email.clientId ?? payload.clientId;
          if (!clientId) throw new Error("ORDER path requires a client");
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtext(${`${clientId}:${creationDay}`}))
          `;
          const order = await createOrderInTransaction(transaction, {
            clientId,
            title:
              classification.title ?? payload.title ?? (email.subject.trim() || "Untitled order"),
            orderType: classification.orderType ?? payload.orderType ?? "Email intake",
            ...(classification.quantity ? { quantity: classification.quantity } : {}),
            sourceLinks: sources,
            actor,
            correlationId,
            backupRoot: env.BACKUP_ROOT_UNC,
            productionRoot: env.PRODUCTION_ROOT_UNC,
          });
          await transaction.order.update({
            where: { id: order.id },
            data: {
              status: "UNASSIGNED",
              gmailThreadId: email.gmailThreadId,
            },
          });
          const initialBatch = await transaction.orderBatch.findUniqueOrThrow({
            where: { orderId_sequence: { orderId: order.id, sequence: 1 } },
            select: { id: true },
          });
          orderId = order.id;
          batchId = initialBatch.id;
        }

        if (batchId && sources.length > 0) {
          await queueBatchTransfer(transaction, { batchId, correlationId });
        }

        await transaction.emailMessage.update({
          where: { id: email.id },
          data: {
            clientId: (
              await transaction.order.findUniqueOrThrow({
                where: { id: orderId! },
                select: { clientId: true },
              })
            ).clientId,
            orderId,
            triageStatus: "LINKED",
          },
        });
        await transaction.proposal.update({
          where: { id: input.proposalId },
          data: {
            status: "ACCEPTED",
            kind: orderId && payload.orderId ? "ADD_BATCH" : "CREATE_ORDER",
            decidedAt: new Date(),
          },
        });
        await transaction.orderEvent.create({
          data: {
            orderId: orderId!,
            ...(batchId ? { batchId } : {}),
            type: "email.order_intake_auto",
            payload: {
              emailMessageId: email.id,
              proposalId: input.proposalId,
              classification,
            },
            actorUserId: actor.userId,
            actorLabel: actor.label,
            correlationId,
          },
        });
        await recordAudit(transaction, {
          correlationId,
          actorUserId: actor.userId,
          actorLabel: actor.label,
          action: "email.order_intake_auto",
          entityType: "Order",
          entityId: orderId!,
          metadata: { emailMessageId: email.id, batchId, classification },
        });

        return { orderId: orderId!, batchId };
      });

      return {
        paused: false,
        skippedReason: null,
        orderId: result.orderId,
        batchId: result.batchId,
        conversationOutboundId: null,
        classification,
      };
    } catch (error) {
      await db.proposal.updateMany({
        where: { id: input.proposalId, status: "PENDING" },
        data: { kind: "NEEDS_HUMAN" },
      });
      await recordAudit(db, {
        correlationId,
        actorUserId: null,
        actorLabel: "System Ingest",
        action: "email.order_intake_failed",
        entityType: "EmailMessage",
        entityId: email.id,
        metadata: {
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
        },
      });
      return {
        ...empty,
        skippedReason: "order_create_failed_needs_human",
        classification,
      };
    }
  }

  // Conversation path (known or unknown client).
  const clientDisplayName = email.client?.displayName ?? email.fromAddress.split("@")[0] ?? "there";
  const title = email.subject.trim() || "your message";

  const aiDraft = await AiOrchestrator.draftConversationReply(
    {
      clientDisplayName,
      title,
      subject: email.subject,
      bodyText: email.bodyText.slice(0, 4000),
      unknownClient: !clientKnown,
    },
    aiConfig,
  );

  try {
    const outbound = await draftAndSystemApproveOutbound(db, {
      template: "CONVERSATION_REPLY",
      idempotencyKey: `conversation:${email.gmailMessageId}`,
      gmailThreadId: email.gmailThreadId,
      emailMessageId: email.id,
      ...(email.orderId ? { orderId: email.orderId } : {}),
      ...(aiDraft
        ? { rendered: aiDraft, bodySource: "AI" as const, aiModel: aiConfig.model }
        : {
            context: {
              clientDisplayName,
              title,
              messageBody: clientKnown
                ? "Thank you for your message. Our Client Support team is reviewing it and will follow up in this thread shortly."
                : "Thank you for contacting us. We are reviewing your message. A team member will follow up once your account is confirmed.",
            },
          }),
    });

    if (!clientKnown) {
      await db.proposal.updateMany({
        where: { id: input.proposalId, status: "PENDING" },
        data: { kind: "NEEDS_HUMAN" },
      });
    }

    return {
      paused: false,
      skippedReason: null,
      orderId: email.orderId,
      batchId: null,
      conversationOutboundId: outbound.id,
      classification,
    };
  } catch (error) {
    if (error instanceof OutboundPausedError) {
      return { ...empty, paused: true, skippedReason: "paused", classification };
    }
    await db.proposal.updateMany({
      where: { id: input.proposalId, status: "PENDING" },
      data: { kind: "NEEDS_HUMAN" },
    });
    await recordAudit(db, {
      correlationId,
      actorUserId: null,
      actorLabel: "System Ingest",
      action: "email.conversation_draft_failed",
      entityType: "EmailMessage",
      entityId: email.id,
      metadata: {
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      },
    });
    return {
      ...empty,
      skippedReason: "conversation_draft_failed",
      classification,
    };
  }
}
