import { Prisma, type PrismaClient, type TransferErrorClass, type TransferJob } from "@cs/db";
import { assertBatchTransition, type BatchStatus } from "@cs/shared";
import { recordAudit } from "@/lib/audit";

const DEFAULT_LEASE_DURATION_MS = 60_000;
const MAX_ERROR_LENGTH = 2_000;

export type LeaseJobInput = {
  leaseOwner: string;
  now?: Date;
  leaseDurationMs?: number;
};

export type OwnedJobInput = {
  jobId: string;
  leaseOwner: string;
  attempt: number;
  now?: Date;
};

export class JobLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobLeaseError";
  }
}

function requireLeaseOwner(value: string): string {
  const owner = value.trim();
  if (owner.length === 0 || owner.length > 200) {
    throw new Error("Lease owner must contain 1 to 200 characters");
  }
  return owner;
}

function leaseExpiry(now: Date, durationMs: number): Date {
  if (!Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 15 * 60_000) {
    throw new Error("Lease duration must be between 1 second and 15 minutes");
  }
  return new Date(now.getTime() + durationMs);
}

function validDate(value: Date, label: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid date`);
  }
  return value;
}

function normaliseError(value: string): string {
  const error = value.trim();
  if (error.length === 0) {
    throw new Error("Failure reason is required");
  }
  return error.slice(0, MAX_ERROR_LENGTH);
}

function requireAttempt(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Lease attempt must be a positive integer");
  }
  return value;
}

type PipelineJobWithBatch = Prisma.TransferJobGetPayload<{
  include: { batch: { include: { order: { select: { id: true } } } } };
}>;

export async function markTerminalPipelineFailure(
  transaction: Prisma.TransactionClient,
  job: PipelineJobWithBatch,
  input: { errorClass: TransferErrorClass; error: string },
): Promise<TransferJob> {
  const error = normaliseError(input.error);
  const updated = await transaction.transferJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error,
      errorClass: input.errorClass,
    },
  });
  if (job.batch.status !== "FAILED") {
    assertBatchTransition(job.batch.status as BatchStatus, "FAILED");
    await transaction.orderBatch.update({
      where: { id: job.batchId },
      data: { status: "FAILED", failureReason: error.slice(0, 1_000) },
    });
    const eventType = "transfer.failed";
    await transaction.orderEvent.create({
      data: {
        orderId: job.batch.order.id,
        batchId: job.batchId,
        type: eventType,
        payload: {
          jobId: job.id,
          jobKind: job.kind,
          errorClass: input.errorClass,
        },
        actorLabel: "File Agent",
        correlationId: job.correlationId,
      },
    });
    await recordAudit(transaction, {
      correlationId: job.correlationId,
      actorUserId: null,
      actorLabel: "File Agent",
      action: eventType,
      entityType: "TransferJob",
      entityId: job.id,
      metadata: {
        batchId: job.batchId,
        jobKind: job.kind,
        errorClass: input.errorClass,
      },
    });
  }
  return updated;
}

export async function leaseNextJob(
  db: PrismaClient,
  input: LeaseJobInput,
): Promise<TransferJob | null> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const now = validDate(input.now ?? new Date(), "Lease time");
  const expiresAt = leaseExpiry(now, input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS);

  return db.$transaction(async (transaction) => {
    for (;;) {
      const exhausted = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "TransferJob"
        WHERE "status" = 'LEASED'::"TransferJobStatus"
          AND "leaseExpiresAt" <= ${now}
          AND "attempts" >= "maxAttempts"
        ORDER BY "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      const exhaustedId = exhausted[0]?.id;
      if (!exhaustedId) break;
      const expiredJob = await transaction.transferJob.findUniqueOrThrow({
        where: { id: exhaustedId },
        include: { batch: { include: { order: { select: { id: true } } } } },
      });
      await markTerminalPipelineFailure(transaction, expiredJob, {
        errorClass: "TRANSIENT",
        error: "Job lease expired after the final permitted attempt",
      });
    }

    const jobs = await transaction.$queryRaw<TransferJob[]>(Prisma.sql`
      WITH next_job AS (
        SELECT "id"
        FROM "TransferJob"
        WHERE (
          "status" = 'QUEUED'::"TransferJobStatus"
          OR (
            "status" = 'LEASED'::"TransferJobStatus"
            AND "leaseExpiresAt" <= ${now}
          )
        )
        AND "attempts" < "maxAttempts"
        ORDER BY "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "TransferJob" AS job
      SET
        "status" = 'LEASED'::"TransferJobStatus",
        "attempts" = job."attempts" + 1,
        "leaseOwner" = ${owner},
        "leaseExpiresAt" = ${expiresAt},
        "lastError" = NULL,
        "errorClass" = NULL,
        "updatedAt" = ${now}
      FROM next_job
      WHERE job."id" = next_job."id"
      RETURNING job.*
    `);

    const leased = jobs[0] ?? null;
    if (leased?.kind === "DOWNLOAD") {
      const batch = await transaction.orderBatch.findUniqueOrThrow({
        where: { id: leased.batchId },
        include: { order: { select: { id: true } } },
      });
      if (batch.status === "PENDING") {
        assertBatchTransition("PENDING", "DOWNLOADING");
        await transaction.orderBatch.update({
          where: { id: batch.id },
          data: { status: "DOWNLOADING", failureReason: null },
        });
        await transaction.orderEvent.create({
          data: {
            orderId: batch.order.id,
            batchId: batch.id,
            type: "transfer.download.started",
            payload: { jobId: leased.id, attempt: leased.attempts },
            actorLabel: "File Agent",
            correlationId: leased.correlationId,
          },
        });
        await recordAudit(transaction, {
          correlationId: leased.correlationId,
          actorUserId: null,
          actorLabel: "File Agent",
          action: "transfer.download.started",
          entityType: "TransferJob",
          entityId: leased.id,
          metadata: { batchId: batch.id, attempt: leased.attempts },
        });
      }
    }
    return leased;
  });
}

export async function heartbeat(
  db: PrismaClient,
  input: OwnedJobInput & { leaseDurationMs?: number },
): Promise<TransferJob> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const attempt = requireAttempt(input.attempt);
  const now = validDate(input.now ?? new Date(), "Heartbeat time");
  const expiresAt = leaseExpiry(now, input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS);
  const updated = await db.transferJob.updateMany({
    where: {
      id: input.jobId,
      status: "LEASED",
      leaseOwner: owner,
      attempts: attempt,
      leaseExpiresAt: { gt: now },
    },
    data: { leaseExpiresAt: expiresAt },
  });
  if (updated.count !== 1) {
    throw new JobLeaseError("Job lease is missing, expired, or owned by another agent");
  }
  return db.transferJob.findUniqueOrThrow({ where: { id: input.jobId } });
}

export async function updateJobProgress(
  db: PrismaClient,
  input: OwnedJobInput & {
    bytesDone: number;
    bytesTotal: number;
    leaseDurationMs?: number;
  },
): Promise<TransferJob> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const attempt = requireAttempt(input.attempt);
  const now = validDate(input.now ?? new Date(), "Progress time");
  const expiresAt = leaseExpiry(now, input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS);
  if (
    !Number.isSafeInteger(input.bytesDone) ||
    !Number.isSafeInteger(input.bytesTotal) ||
    input.bytesDone < 0 ||
    input.bytesTotal < 0 ||
    input.bytesDone > input.bytesTotal
  ) {
    throw new Error(
      "Progress bytes must be safe non-negative integers with done no greater than total",
    );
  }

  const updated = await db.transferJob.updateMany({
    where: {
      id: input.jobId,
      status: "LEASED",
      leaseOwner: owner,
      attempts: attempt,
      leaseExpiresAt: { gt: now },
    },
    data: {
      bytesDone: BigInt(input.bytesDone),
      bytesTotal: BigInt(input.bytesTotal),
      leaseExpiresAt: expiresAt,
    },
  });
  if (updated.count !== 1) {
    throw new JobLeaseError("Job lease is missing, expired, or owned by another agent");
  }
  return db.transferJob.findUniqueOrThrow({ where: { id: input.jobId } });
}

export async function completeJob(db: PrismaClient, input: OwnedJobInput): Promise<TransferJob> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const attempt = requireAttempt(input.attempt);
  const now = validDate(input.now ?? new Date(), "Completion time");
  const updated = await db.transferJob.updateMany({
    where: {
      id: input.jobId,
      status: "LEASED",
      leaseOwner: owner,
      attempts: attempt,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: "SUCCEEDED",
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      errorClass: null,
    },
  });
  if (updated.count !== 1) {
    throw new JobLeaseError("Job lease is missing, expired, or owned by another agent");
  }
  return db.transferJob.findUniqueOrThrow({ where: { id: input.jobId } });
}

export async function failJob(
  db: PrismaClient,
  input: OwnedJobInput & { errorClass: TransferErrorClass; error: string },
): Promise<TransferJob> {
  const owner = requireLeaseOwner(input.leaseOwner);
  const attempt = requireAttempt(input.attempt);
  const now = validDate(input.now ?? new Date(), "Failure time");
  const error = normaliseError(input.error);

  return db.$transaction(async (transaction) => {
    const job = await transaction.transferJob.findFirst({
      where: {
        id: input.jobId,
        status: "LEASED",
        leaseOwner: owner,
        attempts: attempt,
        leaseExpiresAt: { gt: now },
      },
    });
    if (!job) {
      throw new JobLeaseError("Job lease is missing, expired, or owned by another agent");
    }

    const terminal = input.errorClass === "PERMANENT" || job.attempts >= job.maxAttempts;
    return transaction.transferJob.update({
      where: { id: job.id },
      data: {
        status: terminal ? "FAILED" : "QUEUED",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: error,
        errorClass: input.errorClass,
      },
    });
  });
}
