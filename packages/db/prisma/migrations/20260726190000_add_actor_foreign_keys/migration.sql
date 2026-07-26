-- Add indexes for actor lookups before enforcing the relationships.
CREATE INDEX "Order_createdById_idx" ON "Order"("createdById");
CREATE INDEX "OrderBatch_createdById_idx" ON "OrderBatch"("createdById");
CREATE INDEX "OrderBatch_manualDropConfirmedById_idx" ON "OrderBatch"("manualDropConfirmedById");
CREATE INDEX "SourceLink_addedById_idx" ON "SourceLink"("addedById");
CREATE INDEX "OrderEvent_actorUserId_idx" ON "OrderEvent"("actorUserId");

-- Actor references are audit-bearing and must never cascade when a user is removed.
ALTER TABLE "Order"
ADD CONSTRAINT "Order_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderBatch"
ADD CONSTRAINT "OrderBatch_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderBatch"
ADD CONSTRAINT "OrderBatch_manualDropConfirmedById_fkey"
FOREIGN KEY ("manualDropConfirmedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SourceLink"
ADD CONSTRAINT "SourceLink_addedById_fkey"
FOREIGN KEY ("addedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderEvent"
ADD CONSTRAINT "OrderEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
