-- Signup-form redesign: collect phone + country at signup time so the
-- guest-pay flow can route via the right tax/locale rules and we can
-- SMS reservations confirmations without prompting again later.
--
-- Both columns are nullable — legacy venues created before this
-- migration won't have them set; the signup form is what fills them
-- on the new path. The guest pay flow already falls back to zipCode
-- for tax if address parsing fails, so legacy venues keep working.

ALTER TABLE "Venue"
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "country"     TEXT;

-- Enable RLS on the new columns' parent table — already enabled in
-- 20260515_enable_rls_legacy_tables, this is a no-op but kept here
-- as an audit anchor.
ALTER TABLE "Venue" ENABLE ROW LEVEL SECURITY;
