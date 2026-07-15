-- Reviews & reputation suite (R1): Google Business Profile connection +
-- mirrored Google reviews + employee/shift attribution on internal
-- feedback. Additive only.
--
-- Rollback:
--   DROP TABLE "GoogleReview";
--   DROP TABLE "GbpConnection";
--   DROP TYPE "GbpConnectionStatus";
--   ALTER TABLE "FeedbackReport" DROP COLUMN "servedByStaffId",
--     DROP COLUMN "servedByName", DROP COLUMN "shiftBucket";

-- 1) Attribution columns on internal feedback (R2).
ALTER TABLE "FeedbackReport" ADD COLUMN "servedByStaffId" TEXT;
ALTER TABLE "FeedbackReport" ADD COLUMN "servedByName" TEXT;
ALTER TABLE "FeedbackReport" ADD COLUMN "shiftBucket" TEXT;
CREATE INDEX "FeedbackReport_venueId_servedByStaffId_idx"
  ON "FeedbackReport"("venueId", "servedByStaffId");

-- 2) GBP connection status enum + table.
CREATE TYPE "GbpConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'DISCONNECTED', 'ERROR');

CREATE TABLE "GbpConnection" (
  "id"                    TEXT NOT NULL,
  "venueId"               TEXT NOT NULL,
  "googleEmail"           TEXT,
  "gbpAccountName"        TEXT,
  "gbpLocationName"       TEXT,
  "locationTitle"         TEXT,
  -- AES-256-GCM via lib/pos/crypto; never exposed to the client.
  "encryptedRefreshToken" TEXT,
  "status"                "GbpConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "lastSyncAt"            TIMESTAMP(3),
  "lastError"             TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GbpConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GbpConnection_venueId_key" ON "GbpConnection"("venueId");
CREATE INDEX "GbpConnection_status_idx" ON "GbpConnection"("status");

ALTER TABLE "GbpConnection"
  ADD CONSTRAINT "GbpConnection_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Mirrored Google reviews.
CREATE TABLE "GoogleReview" (
  "id"               TEXT NOT NULL,
  "venueId"          TEXT NOT NULL,
  "gbpReviewName"    TEXT NOT NULL,
  "starRating"       INTEGER NOT NULL,
  "comment"          TEXT,
  "reviewerName"     TEXT,
  "reviewerPhotoUrl" TEXT,
  "gbpCreatedAt"     TIMESTAMP(3) NOT NULL,
  "gbpUpdatedAt"     TIMESTAMP(3),
  "replyText"        TEXT,
  "repliedAt"        TIMESTAMP(3),
  "replySource"      TEXT,
  "aiDraft"          TEXT,
  "seenByMgr"        BOOLEAN NOT NULL DEFAULT false,
  "syncedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoogleReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleReview_gbpReviewName_key" ON "GoogleReview"("gbpReviewName");
CREATE INDEX "GoogleReview_venueId_gbpCreatedAt_idx" ON "GoogleReview"("venueId", "gbpCreatedAt");
CREATE INDEX "GoogleReview_venueId_seenByMgr_idx" ON "GoogleReview"("venueId", "seenByMgr");
CREATE INDEX "GoogleReview_venueId_repliedAt_idx" ON "GoogleReview"("venueId", "repliedAt");

-- 4) RLS: standard posture — app connects as table owner; PostgREST
-- anon/authenticated roles get nothing (rls-coverage.test.ts enforces).
ALTER TABLE "GbpConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoogleReview" ENABLE ROW LEVEL SECURITY;
