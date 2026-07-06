-- Phase 2 billing cutover, step 1 (additive only): link beacon-surface
-- bills to their GuestSession and tag provenance. Enables the
-- dual-write window (new sessions mirror their JSON tab into
-- Order/Bill/BillItem) with every later flip reversible by env flag.
--
-- Bill already has RLS enabled (20260512_guest_commerce_v2) — column
-- adds inherit it.
--
-- Rollback: columns are unused until the dual-write flag turns on;
--   ALTER TABLE "Bill" DROP COLUMN "guestSessionId", DROP COLUMN "source";

ALTER TABLE "Bill" ADD COLUMN "guestSessionId" TEXT;
ALTER TABLE "Bill" ADD COLUMN "source" TEXT;

CREATE INDEX "Bill_guestSessionId_idx" ON "Bill"("guestSessionId");

ALTER TABLE "Bill"
  ADD CONSTRAINT "Bill_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
