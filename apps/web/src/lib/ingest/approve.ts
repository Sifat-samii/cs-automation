import { type DbClient, type PrismaClient, type ProposalKind } from "@cs/db";
import { parseServerEnv } from "@cs/shared";
import { z } from "zod";
import { queueBatchTransfer } from "@/lib/agent/pipeline";
import { recordAudit } from "@/lib/audit";
import { addBatchInTransaction } from "@/lib/orders/batches";
import {
  createOrderInTransaction,
  type OrderMutationActor,
  type SourceLinkInput,
} from "@/lib/orders/create";
import { draftOutboundEmail } from "@/lib/outbound/service";

const proposalPayloadSchema = z.object({
  clientId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  gmailThreadId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  orderType: z.string().trim().min(1).max(200),
  dropboxUrls: z.array(z.url()).max(100),
  driveUrls: z.array(z.url()).max(100),
  attachmentNames: z.array(z.string().trim().min(1).max(500)).max(500),
  notes: z.array(z.string().max(1_000)).max(100),
});

export type ProposalApprovalOverrides = {
  clientId?: string;
  targetOrderId?: string;
  title?: string;
  orderType?: string;
  quantity?: number;
  batchKind?: "ADDITIONAL" | "SAMPLE" | "CORRECTION";
};

export type ApproveProposalInput = {
  proposalId: string;
  actor: OrderMutationActor;
  correlationId: string;
  overrides?: ProposalApprovalOverrides;
  now?: Date;
};

export type ApproveProposalResult = {
  orderId: string | null;
  batchId: string | null;
  outboundEmailId: string | null;
};

type ApprovalDependencies = {
  queueTransfer?: typeof queueBatchTransfer;
};

function sourceLinksFromPayload(payload: z.infer<typeof proposalPayloadSchema>): SourceLinkInput[] {
  return [
    ...payload.dropboxUrls.map((url) => ({ kind: "DROPBOX" as const, url })),
    ...payload.driveUrls.map((url) => ({ kind: "GDRIVE" as const, url })),
    ...payload.attachmentNames.map((localHint) => ({
      kind: "ATTACHMENT" as const,
      localHint,
    })),
  ];
}

function effectiveKind(
  proposedKind: ProposalKind,
  overrides: ProposalApprovalOverrides | undefined,
): ProposalKind {
  if (overrides?.targetOrderId) return "ADD_BATCH";
  if (proposedKind === "NEEDS_HUMAN" && overrides?.clientId) return "CREATE_ORDER";
  return proposedKind;
}

async function acceptedResult(
  db: DbClient,
  emailMessageId: string,
): Promise<ApproveProposalResult> {
  const message = await db.emailMessage.findUniqueOrThrow({
    where: { id: emailMessageId },
    select: { id: true, orderId: true },
  });
  if (!message.orderId) {
    return { orderId: null, batchId: null, outboundEmailId: null };
  }
  const [batch, outbound] = await Promise.all([
    db.orderBatch.findFirst({
      where: { orderId: message.orderId },
      orderBy: { sequence: "desc" },
      select: { id: true },
    }),
    db.outboundEmail.findUnique({
      where: { idempotencyKey: `ack:${message.orderId}:${message.id}` },
      select: { id: true },
    }),
  ]);
  return {
    orderId: message.orderId,
    batchId: batch?.id ?? null,
    outboundEmailId: outbound?.id ?? null,
  };
}

export async function approveProposal(
  db: PrismaClient,
  input: ApproveProposalInput,
  dependencies: ApprovalDependencies = {},
): Promise<ApproveProposalResult> {
  const now = input.now ?? new Date();
  const queueTransfer = dependencies.queueTransfer ?? queueBatchTransfer;
  const env = parseServerEnv(process.env);

  return db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "Proposal"
      WHERE "id" = ${input.proposalId}::uuid
      FOR UPDATE
    `;
    const proposal = await transaction.proposal.findUnique({
      where: { id: input.proposalId },
      include: { emailMessage: true },
    });
    if (!proposal) throw new Error("Proposal does not exist");
    if (proposal.status === "ACCEPTED") {
      return acceptedResult(transaction, proposal.emailMessageId);
    }
    if (proposal.status !== "PENDING") {
      throw new Error(`Cannot approve proposal from ${proposal.status}`);
    }
    if (proposal.source !== "RULE") {
      throw new Error("Phase 3 approval accepts rule proposals only");
    }

    const payload = proposalPayloadSchema.parse(proposal.payload);
    const kind = effectiveKind(proposal.kind, input.overrides);
    if (kind === "NO_ACTION" || kind === "NEEDS_HUMAN") {
      throw new Error("Proposal requires reviewer edits or an explicit ignore decision");
    }
    const sources = sourceLinksFromPayload(payload);
    let orderId: string;
    let batchId: string | null = null;

    if (kind === "CREATE_ORDER") {
      const clientId = input.overrides?.clientId ?? payload.clientId;
      if (!clientId) throw new Error("Creating an order requires a client");
      const creationDay = now.toISOString().slice(0, 10);
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`${clientId}:${creationDay}`}))
      `;
      const order = await createOrderInTransaction(transaction, {
        clientId,
        title: input.overrides?.title ?? payload.title,
        orderType: input.overrides?.orderType ?? payload.orderType,
        ...(input.overrides?.quantity !== undefined ? { quantity: input.overrides.quantity } : {}),
        sourceLinks: sources,
        actor: input.actor,
        correlationId: input.correlationId,
        createdAt: now,
        backupRoot: env.BACKUP_ROOT_UNC,
        productionRoot: env.PRODUCTION_ROOT_UNC,
      });
      await transaction.order.update({
        where: { id: order.id },
        data: { gmailThreadId: proposal.emailMessage.gmailThreadId },
      });
      const initialBatch = await transaction.orderBatch.findUniqueOrThrow({
        where: { orderId_sequence: { orderId: order.id, sequence: 1 } },
        select: { id: true },
      });
      orderId = order.id;
      batchId = initialBatch.id;
    } else {
      orderId = input.overrides?.targetOrderId ?? payload.orderId ?? "";
      if (!orderId) throw new Error("Adding a batch requires a target order");
      await transaction.$queryRaw`
        SELECT "id"
        FROM "Order"
        WHERE "id" = ${orderId}::uuid
        FOR UPDATE
      `;
      const target = await transaction.order.findUnique({
        where: { id: orderId },
        select: { id: true, clientId: true, gmailThreadId: true },
      });
      if (!target) throw new Error("Target order does not exist");
      if (proposal.emailMessage.clientId && target.clientId !== proposal.emailMessage.clientId) {
        throw new Error("Target order does not belong to the resolved client");
      }
      if (!target.gmailThreadId) {
        await transaction.order.update({
          where: { id: target.id },
          data: { gmailThreadId: proposal.emailMessage.gmailThreadId },
        });
      }
      if (sources.length > 0) {
        const batch = await addBatchInTransaction(transaction, {
          orderId: target.id,
          kind: input.overrides?.batchKind ?? "ADDITIONAL",
          notes: `Email intake ${proposal.emailMessage.gmailMessageId}`,
          sourceLinks: sources,
          actor: input.actor,
          correlationId: input.correlationId,
        });
        batchId = batch.id;
      }
    }

    if (batchId && sources.length > 0) {
      await queueTransfer(transaction, {
        batchId,
        correlationId: input.correlationId,
      });
    }

    const outbound = await draftOutboundEmail(transaction, {
      orderId,
      template: "ACKNOWLEDGEMENT",
      idempotencyKey: `ack:${orderId}:${proposal.emailMessageId}`,
      gmailThreadId: proposal.emailMessage.gmailThreadId,
    });

    await transaction.emailMessage.update({
      where: { id: proposal.emailMessageId },
      data: {
        clientId: (
          await transaction.order.findUniqueOrThrow({
            where: { id: orderId },
            select: { clientId: true },
          })
        ).clientId,
        orderId,
        triageStatus: "LINKED",
      },
    });
    await transaction.proposal.update({
      where: { id: proposal.id },
      data: {
        status: "ACCEPTED",
        decidedById: input.actor.userId,
        decidedAt: now,
      },
    });
    await transaction.proposal.updateMany({
      where: {
        emailMessageId: proposal.emailMessageId,
        id: { not: proposal.id },
        status: "PENDING",
      },
      data: {
        status: "SUPERSEDED",
        decidedById: input.actor.userId,
        decidedAt: now,
      },
    });

    await transaction.orderEvent.create({
      data: {
        orderId,
        ...(batchId ? { batchId } : {}),
        type: "email.proposal_accepted",
        payload: {
          emailMessageId: proposal.emailMessageId,
          proposalId: proposal.id,
          proposalKind: kind,
          outboundEmailId: outbound.id,
        },
        actorUserId: input.actor.userId,
        actorLabel: input.actor.label,
        correlationId: input.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: "email.proposal_accepted",
      entityType: "Proposal",
      entityId: proposal.id,
      metadata: {
        emailMessageId: proposal.emailMessageId,
        orderId,
        batchId,
        outboundEmailId: outbound.id,
        kind,
      },
    });

    return { orderId, batchId, outboundEmailId: outbound.id };
  });
}

export async function ignoreEmail(
  db: PrismaClient,
  input: {
    emailMessageId: string;
    actor: OrderMutationActor;
    correlationId: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  await db.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "EmailMessage"
      WHERE "id" = ${input.emailMessageId}::uuid
      FOR UPDATE
    `;
    const updated = await transaction.emailMessage.updateMany({
      where: { id: input.emailMessageId, triageStatus: "UNREVIEWED" },
      data: { triageStatus: "IGNORED" },
    });
    if (updated.count !== 1) throw new Error("Email is not available for review");
    await transaction.proposal.updateMany({
      where: { emailMessageId: input.emailMessageId, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: input.actor.userId,
        decidedAt: now,
      },
    });
    await recordAudit(transaction, {
      correlationId: input.correlationId,
      actorUserId: input.actor.userId,
      actorLabel: input.actor.label,
      action: "email.ignored",
      entityType: "EmailMessage",
      entityId: input.emailMessageId,
    });
  });
}
