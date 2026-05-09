-- Admin panel extensions: notification routing + per-shift feature toggles.
-- All additive, all default-safe (existing rows get the documented defaults).

-- AlterTable: notification routing + per-shift kill switches
ALTER TABLE "Venue" ADD COLUMN "alertEmails" TEXT;
ALTER TABLE "Venue" ADD COLUMN "requestsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Venue" ADD COLUMN "preorderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Venue" ADD COLUMN "reservationsEnabled" BOOLEAN NOT NULL DEFAULT true;
