import type { PrismaClient } from "@cs/db";
import { parseServerEnv, verifyRequest } from "@cs/shared";
import { z } from "zod";

export const AGENT_TIMESTAMP_HEADER = "x-cs-timestamp";
export const AGENT_SIGNATURE_HEADER = "x-cs-signature";

type AuthenticatedBody = { ok: true; body: string } | { ok: false; response: Response };

function authFailure(): Response {
  return Response.json({ error: "Agent authentication failed" }, { status: 401 });
}

export async function authenticateAgentRequest(request: Request): Promise<AuthenticatedBody> {
  const timestamp = request.headers.get(AGENT_TIMESTAMP_HEADER);
  const signature = request.headers.get(AGENT_SIGNATURE_HEADER);
  if (!timestamp || !signature) {
    return { ok: false, response: authFailure() };
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Request body could not be read" }, { status: 400 }),
    };
  }

  const { INGEST_HMAC_SECRET } = parseServerEnv(process.env);
  const verified = verifyRequest({
    secret: INGEST_HMAC_SECRET,
    timestamp,
    body,
    signature,
  });
  return verified.ok ? { ok: true, body } : { ok: false, response: authFailure() };
}

export function parseAgentJson<T extends z.ZodType>(
  schema: T,
  body: string,
): { ok: true; data: z.infer<T> } | { ok: false; response: Response } {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Request body must be valid JSON" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : {
        ok: false,
        response: Response.json({ error: "Request body is invalid" }, { status: 400 }),
      };
}

export async function serializeAgentJob(db: PrismaClient, jobId: string) {
  const job = await db.transferJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      batch: {
        include: {
          sourceLinks: { orderBy: { createdAt: "asc" } },
          order: { include: { client: true } },
        },
      },
    },
  });

  return {
    id: job.id,
    kind: job.kind,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    leaseOwner: job.leaseOwner,
    leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
    bytesTotal: Number(job.bytesTotal),
    bytesDone: Number(job.bytesDone),
    correlationId: job.correlationId,
    batch: {
      id: job.batch.id,
      sequence: job.batch.sequence,
      kind: job.batch.kind,
      status: job.batch.status,
      subfolder: job.batch.subfolder,
      manualDropConfirmed: job.batch.manualDropConfirmedAt !== null,
      sourceLinks: job.batch.sourceLinks.map((source) => ({
        id: source.id,
        kind: source.kind,
        url: source.url,
        localHint: source.localHint,
      })),
      order: {
        id: job.batch.order.id,
        code: job.batch.order.code,
        folderName: job.batch.order.folderName,
        backupPath: job.batch.order.backupPath,
        productionPath: job.batch.order.productionPath,
        createdAtUtc: job.batch.order.createdAt.toISOString(),
        client: {
          code: job.batch.order.client.code,
          folderName: job.batch.order.client.folderName,
        },
      },
    },
  };
}
