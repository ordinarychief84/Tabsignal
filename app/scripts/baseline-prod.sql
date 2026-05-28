-- ============================================================
-- ONE-SHOT PRODUCTION RECOVERY — paste once in Supabase SQL
-- Editor, click Run, you're done.
-- ============================================================
--
-- Context
-- -------
-- Prod's Postgres got out of sync with Prisma's migration history
-- across PRs #43, #45, #46, #47, #48, #49 because:
--   1. Vercel builds run `prisma generate` but NOT `prisma migrate
--      deploy`, so schema changes in PR #43 (Venue.phoneNumber,
--      Venue.country, etc.) were never applied to prod.
--   2. PR #46/#47's auto-migrate attempt hit P3005 ("database
--      schema is not empty") because the prod DB was first set up
--      via Supabase Studio, not via Prisma migrations, so the
--      `_prisma_migrations` history was missing entirely or
--      partial.
--   3. The 20260510_rbac_audit_log_phase1 migration row landed in
--      `_prisma_migrations` with finished_at NULL — a "failed"
--      state — which blocks every subsequent `migrate deploy` with
--      P3009.
--
-- The Venue columns were manually added via Supabase SQL Editor
-- on 2026-05-27 (you ran the 5 ALTER TABLE statements directly).
-- That fixed signup. This script handles everything else:
--
--   - Adds the StaffStatus.DELETED enum value (was waiting for
--     migration 20260522_staff_deleted_and_password_resets).
--   - Creates the PasswordResetToken table (same migration).
--   - Clears the failed `20260510_rbac_audit_log_phase1` row so
--     future Vercel deploys can apply new migrations.
--   - Inserts baseline rows in `_prisma_migrations` so Prisma
--     treats migrations 20260520, 20260521*, 20260522 as already
--     applied (they ARE applied; just not recorded).
--
-- Idempotent end-to-end. Every step has `IF NOT EXISTS` or a
-- pre-check guard. Safe to re-run if anything looks off.
--
-- How to run
-- ----------
--   1. https://supabase.com/dashboard/project/ydcftjsmutszeznjhcdv/sql/new
--   2. Open a fresh "+ New query" tab
--   3. Paste THIS ENTIRE FILE
--   4. Cmd+Enter (or click Run)
--   5. If the "Potential issue detected — RLS" dialog fires:
--      click "Run and enable RLS" (the CREATE TABLE for
--      PasswordResetToken is in here)
--   6. Verify "Success. No rows returned."
--
-- After this runs, the next Vercel production deploy will run
-- `prisma migrate deploy` cleanly. Future schema PRs will apply
-- automatically via the prebuild hook.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Step 1: clear the failed 20260510 migration row.
-- ──────────────────────────────────────────────────────────────
-- Without this, `prisma migrate deploy` returns P3009 forever and
-- refuses to run any subsequent migration.
UPDATE "_prisma_migrations"
   SET rolled_back_at = now()
 WHERE migration_name = '20260510_rbac_audit_log_phase1'
   AND finished_at IS NULL
   AND rolled_back_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- Step 2: add the StaffStatus.DELETED enum value.
-- ──────────────────────────────────────────────────────────────
-- Used by the soft-delete staff flow (PR #45). The application
-- already references this enum value in code; runtime code path
-- has been failing silently when an OWNER tries to remove a
-- staff member.
ALTER TYPE "StaffStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- ──────────────────────────────────────────────────────────────
-- Step 3: create the PasswordResetToken table + indexes + FK + RLS.
-- ──────────────────────────────────────────────────────────────
-- Used by /api/auth/forgot-password (PR #45). Until this table
-- exists, password resets always fail with "Internal Server
-- Error" because Prisma can't write the reset token row.
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id"        TEXT NOT NULL,
  "staffId"   TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "requestIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key"
  ON "PasswordResetToken"("tokenHash");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_staffId_createdAt_idx"
  ON "PasswordResetToken"("staffId", "createdAt");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken"("expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_staffId_fkey'
  ) THEN
    ALTER TABLE "PasswordResetToken"
      ADD CONSTRAINT "PasswordResetToken_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────
-- Step 4: baseline `_prisma_migrations` so Prisma treats the
-- already-applied migrations as applied.
-- ──────────────────────────────────────────────────────────────
-- These migrations' EFFECTS are present in the schema (added
-- manually or pre-existed in Supabase) but Prisma's history
-- doesn't record them. Without baseline rows, `migrate deploy`
-- would try to re-apply them and fail with "column already
-- exists" / "table already exists" errors.
--
-- For each migration below, we insert a "finished" row only if
-- no finished row already exists. Stale rolled-back rows are
-- ignored (Prisma uses the latest started_at, so a fresh
-- finished row supersedes them).

INSERT INTO "_prisma_migrations" (
    id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
)
SELECT
    gen_random_uuid()::text,
    'baselined-by-recovery-2026-05-27',
    now(),
    m.name,
    'Baselined by scripts/baseline-prod.sql — schema effects already present in DB',
    NULL,
    now(),
    1
FROM (VALUES
    ('20260520_onboarding_redesign'),
    ('20260521_venue_phone_country'),
    ('20260521_rls_remaining_models'),
    ('20260522_staff_deleted_and_password_resets')
) AS m(name)
WHERE NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations" m2
     WHERE m2.migration_name = m.name
       AND m2.finished_at IS NOT NULL
       AND m2.rolled_back_at IS NULL
);

-- ──────────────────────────────────────────────────────────────
-- Step 5: diagnostic SELECT — proves the recovery worked.
-- ──────────────────────────────────────────────────────────────
-- After running everything above, this SELECT should show:
--   - Venue cols: 5 (phoneNumber, country, venueType, onboardingState, onboardingCompletedAt)
--   - StaffStatus values: includes 'DELETED'
--   - PasswordResetToken exists: true
--   - _prisma_migrations: failed row is rolled_back, baseline rows present
SELECT 'venue_cols' AS check_name,
       array_agg(column_name ORDER BY column_name)::text AS result
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'Venue'
   AND column_name IN ('phoneNumber','country','venueType','onboardingState','onboardingCompletedAt')
UNION ALL
SELECT 'staffstatus_values',
       array_agg(enumlabel ORDER BY enumsortorder)::text
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'StaffStatus'
UNION ALL
SELECT 'password_reset_table_exists',
       EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'PasswordResetToken')::text
UNION ALL
SELECT 'failed_migration_row',
       coalesce(
         (SELECT CASE WHEN rolled_back_at IS NOT NULL THEN 'cleared'
                      WHEN finished_at IS NOT NULL THEN 'finished'
                      ELSE 'still failed' END
            FROM "_prisma_migrations"
           WHERE migration_name = '20260510_rbac_audit_log_phase1'
           ORDER BY started_at DESC LIMIT 1),
         'no row')
UNION ALL
SELECT 'baseline_rows_present',
       (SELECT count(*)::text FROM "_prisma_migrations"
         WHERE migration_name IN (
           '20260520_onboarding_redesign',
           '20260521_venue_phone_country',
           '20260521_rls_remaining_models',
           '20260522_staff_deleted_and_password_resets')
           AND finished_at IS NOT NULL AND rolled_back_at IS NULL);
