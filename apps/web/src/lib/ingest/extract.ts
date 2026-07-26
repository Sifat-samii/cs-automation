import type { DbClient } from "@cs/db";
import { resolveClientByEmail } from "@/lib/clients/service";

export type EmailAttachmentInput = {
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type ExtractEmailInput = {
  gmailThreadId: string;
  fromAddress: string;
  subject: string;
  bodyText: string;
  attachments?: readonly EmailAttachmentInput[];
};

export type EmailExtraction = {
  clientId: string | null;
  orderId: string | null;
  gmailThreadId: string;
  title: string;
  dropboxUrls: string[];
  driveUrls: string[];
  attachmentNames: string[];
  notes: string[];
};

const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_URL_PUNCTUATION = /[),.;:!?]+$/u;
const DROPBOX_HOST = /^(?:www\.)?dropbox\.com$/iu;
const DRIVE_HOST = /^(?:drive|docs)\.google\.com$/iu;

function extractProviderUrls(bodyText: string, hostPattern: RegExp): string[] {
  const urls = new Set<string>();
  for (const match of bodyText.matchAll(URL_CANDIDATE)) {
    const candidate = match[0].replace(TRAILING_URL_PUNCTUATION, "");
    try {
      const parsed = new URL(candidate);
      if (hostPattern.test(parsed.hostname)) urls.add(parsed.toString());
    } catch {
      // Malformed URL-like text is deliberately ignored.
    }
  }
  return [...urls];
}

function normaliseAttachmentNames(attachments: readonly EmailAttachmentInput[]): string[] {
  return [
    ...new Set(
      attachments.map((attachment) => attachment.filename.trim()).filter((name) => name.length > 0),
    ),
  ];
}

export async function extractFromEmail(
  db: DbClient,
  input: ExtractEmailInput,
): Promise<EmailExtraction> {
  const [client, order] = await Promise.all([
    resolveClientByEmail(db, input.fromAddress),
    db.order.findUnique({
      where: { gmailThreadId: input.gmailThreadId },
      select: { id: true, clientId: true },
    }),
  ]);

  const notes: string[] = [];
  if (order && client && order.clientId !== client.id) {
    notes.push("Thread order belongs to a different client than the sender identity.");
  }

  return {
    clientId: client?.id ?? null,
    orderId: order && (!client || order.clientId === client.id) ? order.id : null,
    gmailThreadId: input.gmailThreadId,
    title: input.subject.trim() || "Untitled email request",
    dropboxUrls: extractProviderUrls(input.bodyText, DROPBOX_HOST),
    driveUrls: extractProviderUrls(input.bodyText, DRIVE_HOST),
    attachmentNames: normaliseAttachmentNames(input.attachments ?? []),
    notes,
  };
}
