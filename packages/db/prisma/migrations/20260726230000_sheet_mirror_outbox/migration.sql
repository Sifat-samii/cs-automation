-- CreateEnum
CREATE TYPE "SheetMirrorOperation" AS ENUM ('UPSERT');

-- CreateEnum
CREATE TYPE "SheetMirrorStatus" AS ENUM ('PENDING', 'CLAIMED', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "SheetMirrorOutbox" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "operation" "SheetMirrorOperation" NOT NULL DEFAULT 'UPSERT',
    "payload" JSONB NOT NULL,
    "status" "SheetMirrorStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerRowKey" TEXT,
    "dispatchedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SheetMirrorOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SheetMirrorOutbox_status_createdAt_idx" ON "SheetMirrorOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SheetMirrorOutbox_orderId_idx" ON "SheetMirrorOutbox"("orderId");

-- AddForeignKey
ALTER TABLE "SheetMirrorOutbox" ADD CONSTRAINT "SheetMirrorOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
