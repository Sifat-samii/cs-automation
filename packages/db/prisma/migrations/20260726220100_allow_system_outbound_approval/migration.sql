-- Allow system auto-approval: APPROVED/SENDING/SENT/FAILED may have approvedById NULL
-- when approvedAt is set (ADR 0007).
ALTER TABLE "OutboundEmail" DROP CONSTRAINT "OutboundEmail_approval_check";

ALTER TABLE "OutboundEmail" ADD CONSTRAINT "OutboundEmail_approval_check" CHECK (
    ("status" = 'DRAFT' AND "approvedById" IS NULL AND "approvedAt" IS NULL)
    OR ("status" <> 'DRAFT' AND "approvedAt" IS NOT NULL)
);
