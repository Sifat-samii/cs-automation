-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "EmailTriageStatus" AS ENUM ('UNREVIEWED', 'LINKED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('CREATE_ORDER', 'ADD_BATCH', 'NO_ACTION', 'NEEDS_HUMAN');

-- CreateEnum
CREATE TYPE "ProposalSource" AS ENUM ('RULE', 'LLM');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OutboundTemplate" AS ENUM ('ACKNOWLEDGEMENT', 'FILES_VERIFIED', 'ETA_NOTICE');

-- CreateEnum
CREATE TYPE "OutboundEmailStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" UUID NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "direction" "EmailDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "clientId" UUID,
    "orderId" UUID,
    "triageStatus" "EmailTriageStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" UUID NOT NULL,
    "emailMessageId" UUID NOT NULL,
    "kind" "ProposalKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "source" "ProposalSource" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Proposal_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);

-- CreateTable
CREATE TABLE "OutboundEmail" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "template" "OutboundTemplate" NOT NULL,
    "renderedSubject" TEXT NOT NULL,
    "renderedBody" TEXT NOT NULL,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(6),
    "idempotencyKey" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "sentMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OutboundEmail_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutboundEmail_approval_check" CHECK (
        ("status" = 'DRAFT' AND "approvedById" IS NULL AND "approvedAt" IS NULL)
        OR ("status" <> 'DRAFT' AND "approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_gmailMessageId_key" ON "EmailMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_triageStatus_receivedAt_idx" ON "EmailMessage"("triageStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_gmailThreadId_idx" ON "EmailMessage"("gmailThreadId");

-- CreateIndex
CREATE INDEX "EmailMessage_clientId_idx" ON "EmailMessage"("clientId");

-- CreateIndex
CREATE INDEX "EmailMessage_orderId_idx" ON "EmailMessage"("orderId");

-- CreateIndex
CREATE INDEX "Proposal_emailMessageId_status_idx" ON "Proposal"("emailMessageId", "status");

-- CreateIndex
CREATE INDEX "Proposal_status_createdAt_idx" ON "Proposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_decidedById_idx" ON "Proposal"("decidedById");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmail_idempotencyKey_key" ON "OutboundEmail"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboundEmail_status_createdAt_idx" ON "OutboundEmail"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmail_orderId_template_idx" ON "OutboundEmail"("orderId", "template");

-- CreateIndex
CREATE INDEX "OutboundEmail_approvedById_idx" ON "OutboundEmail"("approvedById");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
