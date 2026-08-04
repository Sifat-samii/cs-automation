-- CreateEnum
CREATE TYPE "TransferJobKind" AS ENUM ('DOWNLOAD', 'STAGE_VERIFY', 'WRITE_BACKUP', 'COPY_PRODUCTION', 'VERIFY_PRODUCTION');

-- CreateEnum
CREATE TYPE "TransferJobStatus" AS ENUM ('QUEUED', 'LEASED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransferErrorClass" AS ENUM ('TRANSIENT', 'PERMANENT');

-- CreateEnum
CREATE TYPE "FileArtifactStage" AS ENUM ('STAGED', 'BACKUP', 'PRODUCTION');

-- AlterTable
ALTER TABLE "OrderBatch"
ADD COLUMN "manualDropConfirmedAt" TIMESTAMPTZ(6),
ADD COLUMN "manualDropConfirmedById" UUID;

-- CreateTable
CREATE TABLE "TransferJob" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "kind" "TransferJobKind" NOT NULL,
    "status" "TransferJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "errorClass" "TransferErrorClass",
    "bytesTotal" BIGINT NOT NULL DEFAULT 0,
    "bytesDone" BIGINT NOT NULL DEFAULT 0,
    "correlationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TransferJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TransferJob_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "TransferJob_maxAttempts_check" CHECK ("maxAttempts" > 0),
    CONSTRAINT "TransferJob_progress_check" CHECK ("bytesTotal" >= 0 AND "bytesDone" >= 0)
);

-- CreateTable
CREATE TABLE "FileArtifact" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "relativePath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "stage" "FileArtifactStage" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileArtifact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FileArtifact_sizeBytes_check" CHECK ("sizeBytes" >= 0),
    CONSTRAINT "FileArtifact_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferJob_batchId_kind_key" ON "TransferJob"("batchId", "kind");

-- CreateIndex
CREATE INDEX "TransferJob_status_leaseExpiresAt_createdAt_idx" ON "TransferJob"("status", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileArtifact_batchId_stage_relativePath_key" ON "FileArtifact"("batchId", "stage", "relativePath");

-- CreateIndex
CREATE INDEX "FileArtifact_batchId_stage_idx" ON "FileArtifact"("batchId", "stage");

-- AddForeignKey
ALTER TABLE "TransferJob" ADD CONSTRAINT "TransferJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OrderBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileArtifact" ADD CONSTRAINT "FileArtifact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OrderBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
