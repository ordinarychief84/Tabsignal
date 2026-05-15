-- Add optional password sign-in for StaffMember. Magic-link auth stays
-- the default; password is an opt-in upgrade.
--
-- Columns are nullable so every existing row keeps working — they
-- continue to sign in via magic link until they set a password.
ALTER TABLE "StaffMember"
  ADD COLUMN IF NOT EXISTS "passwordHash"      TEXT,
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt"   TIMESTAMP(3);

-- Backfill emailVerifiedAt for rows that have already signed in at least
-- once (lastSeenAt is the proxy). A successful magic-link sign-in proves
-- email ownership, so it's fine to mark them verified retroactively.
UPDATE "StaffMember"
SET "emailVerifiedAt" = COALESCE("lastSeenAt", "createdAt")
WHERE "emailVerifiedAt" IS NULL
  AND "lastSeenAt" IS NOT NULL;
