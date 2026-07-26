import {
  type FileArtifactStage,
  type PrismaClient,
  type TransferErrorClass,
  type TransferJobKind,
} from "@cs/db";
import { assertBatchTransition, type BatchStatus } from "@cs/shared";
import { recordAudit } from "@/lib/audit";
import { JobLeaseError } from "@/lib/agent/jobs";

const NEXT_JOB = {
  DOWNLOAD: "STAGE_VERIFY",
  STAGE_VERIFY: "WRITE_BACKUP",
  WRITE_BACKUP: "COPY_PRODUCTION",
  COPY_PRODUCTION: "VERIFY_PRODUCTION",
  VERIFY_PRODUCTION: null,
} as const satisfies Record<TransferJobKind, TransferJobKind | null>;

const BATCH_STATUS_AFTER = {
  DOWNLOAD: "DOWNLOADING",
  STAGE_VERIFY: "STAGED",
  WRITE_BACKUP: "WRITTEN_BACKUP",
  COPY_PRODUCTION: "COPIED_PRODUCTION",
  VERIFY_PRODUCTION: "VERIFIED",
} as const satisfies Record<TransferJobKind, BatchStatus>;

const ARTIFACT_STAGE = {
  DOWNLOAD: null,
  STAGE_VERIFY: "STAGED",
  WRITE_BACKUP: "BACKUP",
  COPY_PRODUCTION: "PRODUCTION",
  VERIFY_PRODUCTION: "PRODUCTION",
} as const satisfies Record<TransferJobKind, FileArtifactStage | null>;

export type PipelineArtifactInput = {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
  stage: FileArtifactStage;
};

export async function queueBatchTransfer(
  db: PrismaClient,
  input: { batchId: string; correlationId: string; maxAttempts?: number },
) {
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new Error("Maximum attempts must be between 1 and 20");
  }

  return db.$transaction(async (transaction) => {
    const batch = await transaction.orderBatch.findUnique({
      where: { id: input.batchId },
      select: { status: true },
    });
    if (!batch) throw new Error("Batch does not exist");
    if (batch.status !== "PENDING" && batch.status !== "FAILED") {
      throw new Error(`Batch ${input.batchId} cannot be queued from ${batch.status}`);
    }
    if (batch.status === "FAILED") {
      assertBatchTransition("FAILED", "PENDING");
      await transaction.orderBatch.update({
        where: { id: input.batchId },
        data: { status: "PENDING", failureReason: null },
      });
    }

    return transaction.transferJob.upsert({
      where: {
        batchId_kind: { batchId: input.batchId, kind: "DOWNLOAD" },
      },
      create: {
        batchId: input.batchId,
        kind: "DOWNLOAD",
        maxAttempts,
        correlationId: input.correlationId,
      },
      update: {
        status: "QUEUED",
        attempts: 0,
        maxAttempts,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        errorClass: null,
        bytesTotal: 0,
        bytesDone: 0,
        correlationId: input.correlationId,
      },
    });
  });
}

export async function completePipelineJob(
  db: PrismaClient,
  input: {
    jobId: string;
    leaseOwner: string;
    artifacts: readonly PipelineArtifactInput[];
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return db.$transaction(async (transaction) => {
    const job = await transaction.transferJob.findFirst({
      where: {
        id: input.jobId,
        status: "LEASED",
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: { gt: now },
      },
      include: {
        batch: { include: { order: { select: { id: true } } } },
      },
    });
    if (!job) {
      throw new JobLeaseError("Job lease is missing, expired, or owned by another agent");
    }

    const expectedStage = ARTIFACT_STAGE[job.kind];
    if (expectedStage !== null) {
      if (
        input.artifacts.length === 0 ||
        input.artifacts.some((artifact) => artifact.stage !== expectedStage)
      ) {
        throw new Error(`${job.kind} completion requires a ${expectedStage} manifest`);
      }
      await transaction.fileArtifact.deleteMany({
        where: { batchId: job.batchId, stage: expectedStage },
      });
      await transaction.fileArtifact.createMany({
        data: input.artifacts.map((artifact) => ({
          batchId: job.batchId,
          relativePath: artifact.relativePath,
          sizeBytes: BigInt(artifact.sizeBytes),
          sha256: artifact.sha256,
          stage: artifact.stage,
        })),
      });
    } else if (input.artifacts.length > 0) {
      throw new Error(`${job.kind} completion must not include a manifest`);
    }

    const nextStatus = BATCH_STATUS_AFTER[job.kind];
    if (job.batch.status !== nextStatus) {
      assertBatchTransition(job.batch.status as BatchStatus, nextStatus);
      await transaction.orderBatch.update({
        where: { id: job.batchId },
        data: { status: nextStatus, failureReason: null },
      });
    }
    await transaction.transferJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        errorClass: null,
      },
    });

    const nextKind = NEXT_JOB[job.kind];
    if (nextKind) {
      await transaction.transferJob.upsert({
        where: { batchId_kind: { batchId: job.batchId, kind: nextKind } },
        create: {
          batchId: job.batchId,
          kind: nextKind,
          maxAttempts: job.maxAttempts,
          correlationId: job.correlationId,
        },
        update: {
          status: "QUEUED",
          attempts: 0,
          maxAttempts: job.maxAttempts,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          errorClass: null,
          bytesTotal: 0,
          bytesDone: 0,
          correlationId: job.correlationId,
        },
      });
    }

    const eventType = `transfer.${job.kind.toLowerCase()}.completed`;
    await transaction.orderEvent.create({
      data: {
        orderId: job.batch.order.id,
        batchId: job.batchId,
        type: eventType,
        payload: {
          jobId: job.id,
          batchStatus: nextStatus,
          artifactCount: input.artifacts.length,
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
      metadata: { batchId: job.batchId, batchStatus: nextStatus },
    });

    return { jobId: job.id, batchId: job.batchId, batchStatus: nextStatus, nextKind };
  });
}

export async function failPipelineJob(
  db: PrismaClient,
  input: {
    jobId: string;
    leaseOwner: string;
    errorClass: TransferErrorClass;
    error: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  return db.$transaction(async (transaction) => {
    const job = await transaction.transferJob.findFirst({
      where: {
        id: input.jobId,
        status: "LEASED",
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: { gt: now },
      },
      include: { batch: { include: { order: { select: { id: true } } } } },
    });
    if (!job) {
      throw new JobLeaseError("Job lease is missing, expired, or owned by another agent");
    }

    const terminal = input.errorClass === "PERMANENT" || job.attempts >= job.maxAttempts;
    const updated = await transaction.transferJob.update({
      where: { id: job.id },
      data: {
        status: terminal ? "FAILED" : "QUEUED",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: input.error.slice(0, 2_000),
        errorClass: input.errorClass,
      },
    });
    if (terminal && job.batch.status !== "FAILED") {
      assertBatchTransition(job.batch.status as BatchStatus, "FAILED");
      await transaction.orderBatch.update({
        where: { id: job.batchId },
        data: { status: "FAILED", failureReason: input.error.slice(0, 1_000) },
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
  });
}
