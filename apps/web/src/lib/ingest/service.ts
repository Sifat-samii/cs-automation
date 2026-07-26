import { Prisma, type PrismaClient } from "@cs/db";
import { z } from "zod";
import {
  extractFromEmail,
  type EmailAttachmentInput,
  type ExtractEmailInput,
} from "@/lib/ingest/extract";
import { buildRuleProposal } from "@/lib/ingest/rules";

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(200).optional(),
  sizeBytes: z.number().int().nonnegative().safe().optional(),
});

export const ingestEmailSchema = z.object({
  gmailMessageId: z.string().trim().min(1).max(500),
  gmailThreadId: z.string().trim().min(1).max(500),
  fromAddress: z.email().max(320),
  toAddresses: z.array(z.email().max(320)).min(1).max(100),
  subject: z.string().max(2_000),
  bodyText: z.string().max(1_000_000),
  receivedAt: z.coerce.date(),
  attachments: z.array(attachmentSchema).max(500).optional(),
});

export type IngestEmailInput = z.infer<typeof ingestEmailSchema>;

export type IngestEmailResult = {
  emailMessageId: string;
  proposalId: string;
  duplicate: boolean;
};

function isGmailMessageCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.some((field) => field === "gmailMessageId")
    : String(target).includes("gmailMessageId");
}

async function existingResult(
  db: PrismaClient,
  gmailMessageId: string,
): Promise<IngestEmailResult | null> {
  const existing = await db.emailMessage.findUnique({
    where: { gmailMessageId },
    select: {
      id: true,
      proposals: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } },
    },
  });
  const proposalId = existing?.proposals[0]?.id;
  return existing && proposalId
    ? { emailMessageId: existing.id, proposalId, duplicate: true }
    : null;
}

export async function ingestEmail(
  db: PrismaClient,
  input: IngestEmailInput,
): Promise<IngestEmailResult> {
  const duplicate = await existingResult(db, input.gmailMessageId);
  if (duplicate) return duplicate;

  try {
    return await db.$transaction(async (transaction) => {
      const extractInput: ExtractEmailInput = {
        gmailThreadId: input.gmailThreadId,
        fromAddress: input.fromAddress,
        subject: input.subject,
        bodyText: input.bodyText,
        ...(input.attachments
          ? { attachments: input.attachments as readonly EmailAttachmentInput[] }
          : {}),
      };
      const extraction = await extractFromEmail(transaction, extractInput);
      const proposed = buildRuleProposal(extraction);
      const message = await transaction.emailMessage.create({
        data: {
          gmailMessageId: input.gmailMessageId,
          gmailThreadId: input.gmailThreadId,
          direction: "INBOUND",
          fromAddress: input.fromAddress.toLowerCase(),
          toAddresses: input.toAddresses.map((address) => address.toLowerCase()),
          subject: input.subject,
          bodyText: input.bodyText,
          receivedAt: input.receivedAt,
          clientId: extraction.clientId,
          orderId: extraction.orderId,
          proposals: {
            create: {
              kind: proposed.kind,
              payload: proposed.payload,
              confidence: proposed.confidence,
              source: "RULE",
              evidence: proposed.evidence,
            },
          },
        },
        select: {
          id: true,
          proposals: { select: { id: true } },
        },
      });
      const proposalId = message.proposals[0]?.id;
      if (!proposalId) throw new Error("Email proposal was not created");
      return { emailMessageId: message.id, proposalId, duplicate: false };
    });
  } catch (error) {
    if (isGmailMessageCollision(error)) {
      const replay = await existingResult(db, input.gmailMessageId);
      if (replay) return replay;
    }
    throw error;
  }
}
