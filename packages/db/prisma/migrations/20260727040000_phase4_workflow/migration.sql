-- Phase 4: three-status order lifecycle, ETA lock fields, pause, AI outbound templates.

-- 1. Pause flag first so CANCELLED rows can be backfilled before the enum swap.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "communicationPaused" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Order" SET "communicationPaused" = true WHERE "status"::text = 'CANCELLED';

-- 2. Remaining Order columns (safe to add before enum rewrite).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "detailsLocked" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "etaLockedAt" TIMESTAMPTZ(6);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "etaSentAt" TIMESTAMPTZ(6);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "etaChangeReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ(6);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "approvedById" UUID;

-- 3. Rewrite OrderStatus enum.
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "OrderStatus_new" AS ENUM ('UNASSIGNED', 'IN_PRODUCTION', 'READY_TO_UPLOAD');
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'IN_PRODUCTION' THEN 'IN_PRODUCTION'
    WHEN 'CLOSED' THEN 'READY_TO_UPLOAD'
    ELSE 'UNASSIGNED'
  END
)::"OrderStatus_new";
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'UNASSIGNED'::"OrderStatus";

-- 4. Approved-by FK and index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_approvedById_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Order_approvedById_idx" ON "Order"("approvedById");

-- 5. Outbound template additions (PostgreSQL allows ADD VALUE outside transactions in older versions;
-- Prisma wraps migrations in a transaction — ADD VALUE IF NOT EXISTS is supported on PG 15+).
ALTER TYPE "OutboundTemplate" ADD VALUE IF NOT EXISTS 'ORDER_CONFIRMATION';
ALTER TYPE "OutboundTemplate" ADD VALUE IF NOT EXISTS 'ETA_UPDATE';
ALTER TYPE "OutboundTemplate" ADD VALUE IF NOT EXISTS 'CONVERSATION_REPLY';
ALTER TYPE "OutboundTemplate" ADD VALUE IF NOT EXISTS 'QUERY_REPLY';

-- 6. OutboundEmail AI provenance columns.
ALTER TABLE "OutboundEmail" ADD COLUMN IF NOT EXISTS "bodySource" TEXT NOT NULL DEFAULT 'TEMPLATE';
ALTER TABLE "OutboundEmail" ADD COLUMN IF NOT EXISTS "aiModel" TEXT;
CREATE INDEX IF NOT EXISTS "OutboundEmail_gmailThreadId_idx" ON "OutboundEmail"("gmailThreadId");

-- 7. Mail thread pause state.
CREATE TABLE IF NOT EXISTS "MailThreadState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gmailThreadId" TEXT NOT NULL,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "pausedById" UUID,
  "pausedAt" TIMESTAMPTZ(6),
  "resumedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailThreadState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailThreadState_gmailThreadId_key" ON "MailThreadState"("gmailThreadId");
CREATE INDEX IF NOT EXISTS "MailThreadState_paused_idx" ON "MailThreadState"("paused");
CREATE INDEX IF NOT EXISTS "MailThreadState_pausedById_idx" ON "MailThreadState"("pausedById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MailThreadState_pausedById_fkey'
  ) THEN
    ALTER TABLE "MailThreadState"
      ADD CONSTRAINT "MailThreadState_pausedById_fkey"
      FOREIGN KEY ("pausedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
