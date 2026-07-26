-- AlterTable
ALTER TABLE "User"
ADD COLUMN "loginId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- Preserve existing accounts by using their current unique email as the initial login ID.
UPDATE "User"
SET "loginId" = "email";

ALTER TABLE "User"
ALTER COLUMN "loginId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_loginId_key" ON "User"("loginId");
