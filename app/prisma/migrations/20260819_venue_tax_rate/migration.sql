-- Per-venue sales-tax rate in basis points (825 = 8.25%).
--
-- Nullable on purpose: NULL means "never set", which lib/tax.ts resolves
-- via the legacy Texas ZIP-prefix table, and which blocks go-live and
-- guest payments everywhere else. An explicit 0 is a real rate for a
-- no-sales-tax jurisdiction and is honored, so we must be able to tell
-- "zero" apart from "unset" — hence no DEFAULT.
ALTER TABLE "Venue" ADD COLUMN "taxRateBps" INTEGER;
