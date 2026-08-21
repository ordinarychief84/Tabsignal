-- Remove what's left of money handling from the guest side.
--
-- TabCall stopped taking guest payments in 20260820_remove_guest_payments.
-- These three tables were what remained of the surrounding machinery, and
-- none of them can work without amounts the product no longer sees:
--
--   TipPool / TipPoolShare — split tips over a window of GuestSession
--     .paidAt. That column now means "a server closed this tab out", not
--     "money arrived", so any split computed from it would be describing
--     something that never happened.
--
--   CompAction — applied a credit to a tab. The POS holds the bill; we
--     have nothing to credit. Service recovery replaced it as the answer
--     to a bad rating, and unlike a silent credit it puts a person at the
--     table.
--
-- All three were empty in production when this ran, verified first. The
-- drop order respects the FKs: shares before pools.
DROP TABLE IF EXISTS "TipPoolShare";
DROP TABLE IF EXISTS "TipPool";
DROP TABLE IF EXISTS "CompAction";
DROP TYPE IF EXISTS "TipPoolPeriod";
