-- AlterEnum
ALTER TYPE "OutboundTemplate" ADD VALUE 'RECEIPT_ACKNOWLEDGEMENT';

-- AlterTable
ALTER TABLE "OutboundEmail" ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OutboundEmail" ADD COLUMN "emailMessageId" UUID;

-- AddForeignKey
ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "OutboundEmail_emailMessageId_idx" ON "OutboundEmail"("emailMessageId");
