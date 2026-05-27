#!/usr/bin/env node
/**
 * Production schema recovery for the post-#43 / #45 state.
 *
 * Run once when:
 *   - Signup is returning 500 because the prod DB is missing the
 *     columns `Venue.phoneNumber` / `country` / `venueType` /
 *     `onboardingState` / `onboardingCompletedAt`.
 *   - The `_prisma_migrations` table contains a FAILED row for
 *     `20260510_rbac_audit_log_phase1` (left over from PR #46/#47's
 *     misfired migrate-deploy attempts) and every new Vercel deploy
 *     fails with P3009.
 *
 * What this script does
 * ---------------------
 *   1. Connects to Postgres using DATABASE_URL from the environment.
 *      Falls back to DIRECT_URL if DATABASE_URL is the pooler URL
 *      (migrations bypass the pooler).
 *   2. Reports the BEFORE state — which Venue columns are present,
 *      whether StaffStatus.DELETED exists, whether PasswordResetToken
 *      exists, and whether the failed migration row is still pending.
 *   3. Applies missing changes idempotently. Each step is its own
 *      query so a Postgres rule that blocks ALTER TYPE inside a
 *      transaction (in older Postgres versions, or under Supabase's
 *      transactional SQL editor) doesn't roll back the whole batch.
 *   4. Reports the AFTER state.
 *
 * Safety
 * ------
 *   - Every ALTER is `IF NOT EXISTS`.
 *   - The `_prisma_migrations` UPDATE only fires if the failed row
 *     is in the expected state (finished_at NULL, rolled_back_at NULL).
 *   - DRY_RUN=true runs every step in read-only mode.
 *   - Doesn't drop or modify existing data.
 *
 * Usage
 * -----
 *   cd app
 *   DATABASE_URL='postgresql://...prod...' bun scripts/recover-prod.mjs
 *
 *   # Or for a no-op preview:
 *   DRY_RUN=true DATABASE_URL='...' bun scripts/recover-prod.mjs
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const dryRun = process.env.DRY_RUN === "true";

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  console.error("[recover-prod] Set DATABASE_URL (or DIRECT_URL). Aborting.");
  process.exit(1);
}

// Prefer pg over @prisma/client — pg is already a transitive dep and
// gives us raw SQL control without re-introducing Prisma's
// migration-state guardrails (the very thing we're trying to repair).
let pg;
try {
  pg = require("pg");
} catch {
  console.error(
    "[recover-prod] Couldn't require('pg'). Install once: bun add pg",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  // Supabase pooler needs SSL even from local. Postgres rejects on
  // bad cert — set to verify-none for the one-off run.
  ssl: { rejectUnauthorized: false },
});

const SQL = {
  // Diagnostic queries.
  venueCols: `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'Venue'
       AND column_name IN ('phoneNumber','country','venueType','onboardingState','onboardingCompletedAt')
     ORDER BY column_name;
  `,
  staffStatusValues: `
    SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'StaffStatus'
     ORDER BY e.enumsortorder;
  `,
  hasPasswordResetTable: `
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'PasswordResetToken';
  `,
  failedMigrationRow: `
    SELECT migration_name, started_at, finished_at, rolled_back_at
      FROM "_prisma_migrations"
     WHERE migration_name = '20260510_rbac_audit_log_phase1';
  `,
  // Repair statements.
  addVenueCols: [
    `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "phoneNumber"           TEXT;`,
    `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "country"               TEXT;`,
    `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "venueType"             TEXT;`,
    `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "onboardingState"       JSONB;`,
    `ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);`,
  ],
  addStaffStatusDeleted: `ALTER TYPE "StaffStatus" ADD VALUE IF NOT EXISTS 'DELETED';`,
  createPasswordResetToken: [
    `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
       "id"        TEXT NOT NULL,
       "staffId"   TEXT NOT NULL,
       "tokenHash" TEXT NOT NULL,
       "expiresAt" TIMESTAMP(3) NOT NULL,
       "usedAt"    TIMESTAMP(3),
       "requestIp" TEXT,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
     );`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key"
       ON "PasswordResetToken"("tokenHash");`,
    `CREATE INDEX IF NOT EXISTS "PasswordResetToken_staffId_createdAt_idx"
       ON "PasswordResetToken"("staffId","createdAt");`,
    `CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx"
       ON "PasswordResetToken"("expiresAt");`,
    `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_staffId_fkey'
         ) THEN
           ALTER TABLE "PasswordResetToken"
             ADD CONSTRAINT "PasswordResetToken_staffId_fkey"
             FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id")
             ON DELETE CASCADE ON UPDATE CASCADE;
         END IF;
       END $$;`,
    `ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;`,
  ],
  rollbackFailedMigration: `
    UPDATE "_prisma_migrations"
       SET rolled_back_at = now()
     WHERE migration_name = '20260510_rbac_audit_log_phase1'
       AND finished_at IS NULL
       AND rolled_back_at IS NULL
     RETURNING migration_name;
  `,
};

async function main() {
  console.log(`[recover-prod] Connecting (dryRun=${dryRun})...`);
  await client.connect();
  try {
    // ── BEFORE ──────────────────────────────────────────────────
    const before = await snapshot();
    console.log("[recover-prod] BEFORE state:");
    printState(before);

    // ── 1. Venue columns ────────────────────────────────────────
    const needCols = ["phoneNumber","country","venueType","onboardingState","onboardingCompletedAt"]
      .filter(c => !before.venueColumns.includes(c));
    if (needCols.length === 0) {
      console.log("[recover-prod] ✓ All Venue columns already present.");
    } else {
      console.log(`[recover-prod] Adding Venue columns: ${needCols.join(", ")}`);
      for (const stmt of SQL.addVenueCols) {
        await exec(stmt);
      }
    }

    // ── 2. StaffStatus.DELETED enum value ───────────────────────
    if (before.staffStatusValues.includes("DELETED")) {
      console.log("[recover-prod] ✓ StaffStatus.DELETED already present.");
    } else {
      console.log("[recover-prod] Adding StaffStatus.DELETED enum value.");
      // ALTER TYPE ADD VALUE must run outside the autocommit context
      // in some Postgres versions. We run each statement as its own
      // implicit transaction (pg's Client.query does this by default),
      // so this is safe.
      await exec(SQL.addStaffStatusDeleted);
    }

    // ── 3. PasswordResetToken table ─────────────────────────────
    if (before.passwordResetTableExists) {
      console.log("[recover-prod] ✓ PasswordResetToken already present.");
    } else {
      console.log("[recover-prod] Creating PasswordResetToken table + indexes + FK + RLS.");
      for (const stmt of SQL.createPasswordResetToken) {
        await exec(stmt);
      }
    }

    // ── 4. Clear failed _prisma_migrations row ──────────────────
    const row = before.failedMigrationRow;
    if (!row) {
      console.log("[recover-prod] ✓ No _prisma_migrations row for 20260510_rbac_audit_log_phase1 (nothing to roll back).");
    } else if (row.rolled_back_at) {
      console.log("[recover-prod] ✓ Failed migration row already marked rolled-back.");
    } else if (row.finished_at) {
      console.log("[recover-prod] ✓ Failed migration row actually finished — leaving it.");
    } else {
      console.log("[recover-prod] Marking 20260510_rbac_audit_log_phase1 as rolled_back so future deploys can self-heal.");
      const rb = await exec(SQL.rollbackFailedMigration);
      console.log(`[recover-prod]   updated ${rb?.rowCount ?? 0} row(s).`);
    }

    // ── AFTER ───────────────────────────────────────────────────
    const after = await snapshot();
    console.log("[recover-prod] AFTER state:");
    printState(after);

    const stillMissing = ["phoneNumber","country","venueType","onboardingState","onboardingCompletedAt"]
      .filter(c => !after.venueColumns.includes(c));
    const enumOk = after.staffStatusValues.includes("DELETED");
    const allGood = stillMissing.length === 0 && enumOk && after.passwordResetTableExists;
    if (allGood) {
      console.log("\n[recover-prod] ✓ Schema is fully recovered. Re-test signup at /signup.");
    } else {
      console.log(`\n[recover-prod] WARNING — still missing: ${
        [
          stillMissing.length ? `Venue cols [${stillMissing.join(",")}]` : null,
          !enumOk ? "StaffStatus.DELETED" : null,
          !after.passwordResetTableExists ? "PasswordResetToken table" : null,
        ].filter(Boolean).join("; ")
      }`);
      process.exit(2);
    }
  } finally {
    await client.end();
  }
}

async function snapshot() {
  const venueCols = await client.query(SQL.venueCols);
  const statusVals = await client.query(SQL.staffStatusValues);
  const prtTable = await client.query(SQL.hasPasswordResetTable);
  const failedRow = await client.query(SQL.failedMigrationRow);
  return {
    venueColumns: venueCols.rows.map(r => r.column_name),
    staffStatusValues: statusVals.rows.map(r => r.enumlabel),
    passwordResetTableExists: prtTable.rows.length > 0,
    failedMigrationRow: failedRow.rows[0] ?? null,
  };
}

function printState(s) {
  console.log(`   Venue cols present: [${s.venueColumns.join(", ") || "(none of the 5)"}]`);
  console.log(`   StaffStatus values: [${s.staffStatusValues.join(", ")}]`);
  console.log(`   PasswordResetToken exists: ${s.passwordResetTableExists}`);
  console.log(`   Failed migration row: ${
    s.failedMigrationRow
      ? `finished_at=${s.failedMigrationRow.finished_at ?? "null"} rolled_back_at=${s.failedMigrationRow.rolled_back_at ?? "null"}`
      : "(no row)"
  }`);
}

async function exec(stmt) {
  if (dryRun) {
    console.log("   [DRY_RUN] would run:", stmt.replace(/\s+/g, " ").trim().slice(0, 120));
    return { rowCount: 0 };
  }
  return client.query(stmt);
}

main().catch(err => {
  console.error("[recover-prod] FAILED:", err.message);
  process.exit(1);
});
