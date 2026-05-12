-- One feedback per session. The route already enforces this via a
-- findFirst+throw, but a unique constraint closes the concurrent-submit
-- race window AND makes the DB the source of truth.
--
-- This migration assumes no existing duplicate rows. If a venue somehow
-- ended up with two FeedbackReport rows for the same sessionId before
-- this constraint, the migration will fail — run the dedup query first:
--
--   DELETE FROM "FeedbackReport" a
--   USING "FeedbackReport" b
--   WHERE a.id < b.id AND a."sessionId" = b."sessionId";

CREATE UNIQUE INDEX "FeedbackReport_sessionId_key" ON "FeedbackReport"("sessionId");
