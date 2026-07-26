-- CreateEnum
CREATE TYPE "ClientIdentityKind" AS ENUM ('ADDRESS', 'DOMAIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'ACKNOWLEDGED', 'AWAITING_ETA', 'ETA_SENT', 'IN_PRODUCTION', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderBatchKind" AS ENUM ('INITIAL', 'ADDITIONAL', 'SAMPLE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "OrderBatchStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'STAGED', 'WRITTEN_BACKUP', 'COPIED_PRODUCTION', 'VERIFIED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourceLinkKind" AS ENUM ('DROPBOX', 'GDRIVE', 'ATTACHMENT', 'MANUAL_DROP', 'OTHER');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientIdentity" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "kind" "ClientIdentityKind" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "ClientIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "quantity" INTEGER,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "eta" TIMESTAMPTZ(6),
    "etaNote" TEXT,
    "gmailThreadId" TEXT,
    "folderName" TEXT NOT NULL,
    "backupPath" TEXT NOT NULL,
    "productionPath" TEXT NOT NULL,
    "cancelReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderBatch" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "OrderBatchKind" NOT NULL,
    "status" "OrderBatchStatus" NOT NULL DEFAULT 'PENDING',
    "subfolder" TEXT NOT NULL,
    "notes" TEXT,
    "failureReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OrderBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceLink" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "kind" "SourceLinkKind" NOT NULL,
    "url" TEXT,
    "localHint" TEXT,
    "addedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "batchId" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actorUserId" UUID,
    "actorLabel" TEXT NOT NULL,
    "correlationId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Client_folderName_key" ON "Client"("folderName");

-- CreateIndex
CREATE INDEX "ClientIdentity_clientId_idx" ON "ClientIdentity"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientIdentity_kind_value_key" ON "ClientIdentity"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_gmailThreadId_key" ON "Order"("gmailThreadId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_clientId_createdAt_idx" ON "Order"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderBatch_status_idx" ON "OrderBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrderBatch_orderId_sequence_key" ON "OrderBatch"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "SourceLink_batchId_idx" ON "SourceLink"("batchId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_occurredAt_idx" ON "OrderEvent"("orderId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ClientIdentity" ADD CONSTRAINT "ClientIdentity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderBatch" ADD CONSTRAINT "OrderBatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceLink" ADD CONSTRAINT "SourceLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OrderBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TRIGGER order_event_no_update
  BEFORE UPDATE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();

CREATE TRIGGER order_event_no_delete
  BEFORE DELETE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
