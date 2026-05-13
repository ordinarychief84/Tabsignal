-- Admin Panel Option B — three small additive columns.
-- All nullable / defaulted, all purely additive, zero data risk.

-- 1. StaffMember.section: free-text section assignment (e.g. "Patio",
--    "Bar", "Floor 2"). Display + filter only; doesn't affect
--    TableAssignment routing.
ALTER TABLE "StaffMember" ADD COLUMN IF NOT EXISTS "section" TEXT;

-- 2. Venue guest-copy fields: manager-editable customer-facing strings
--    that render in the QR landing and feedback screen. Null falls
--    back to baked-in defaults in the guest UI.
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "guestWelcomeMessage" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "guestConfirmationMessage" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "reviewPrompt" TEXT;

-- 3. FeedbackReport.flagged: manager-flagged follow-up state.
--    Independent of seenByMgr (a review can be both seen AND flagged).
ALTER TABLE "FeedbackReport" ADD COLUMN IF NOT EXISTS "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FeedbackReport" ADD COLUMN IF NOT EXISTS "flaggedAt" TIMESTAMP(3);
