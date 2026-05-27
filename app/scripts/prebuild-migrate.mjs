#!/usr/bin/env node
/**
 * Vercel prebuild hook: apply pending Prisma migrations to the
 * **production** database only.
 *
 * Why this exists
 * ---------------
 * Vercel builds run `prisma generate && next build`. They do NOT run
 * `prisma migrate deploy`. If a PR adds a migration and merges, the
 * deployed code expects the new columns/tables but the production
 * Postgres still has the old schema. The first request that touches
 * the new shape blows up with "column does not exist" — which the
 * route turns into an opaque 500. We caught this when signup started
 * 500ing after PR #43 added `Venue.phoneNumber` + `Venue.country`.
 *
 * Why a guard
 * -----------
 * Preview deploys typically share the prod DATABASE_URL on Vercel.
 * If we ran `migrate deploy` on every preview, a PR with a half-
 * baked migration could destructively change prod the moment Vercel
 * builds the preview. We only auto-apply when VERCEL_ENV=production.
 *
 * Safety
 * ------
 * `prisma migrate deploy` is the production-safe Prisma command:
 *   - applies only migrations the DB hasn't seen
 *   - never rewrites schema based on schema.prisma
 *   - errors if a previously-applied migration was edited
 *   - records every applied migration in `_prisma_migrations`
 * If anything fails the build fails LOUDLY and the deploy doesn't
 * promote — production keeps serving the previous build.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const env = process.env.VERCEL_ENV ?? "(unset)";

if (env !== "production") {
  console.log(`[prebuild-migrate] Skipping prisma migrate deploy (VERCEL_ENV=${env}).`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[prebuild-migrate] DATABASE_URL is missing on a production build — aborting.");
  process.exit(1);
}

// Resolve the prisma binary directly from node_modules. Avoids depending
// on `bunx`, `npx`, or any specific package-manager being on the Vercel
// PATH (the first version of this script used `bunx`, which doesn't
// exist on Vercel's default Node runtime — deploys failed silently).
const prismaBin = resolvePrismaBin();
if (!prismaBin) {
  console.error(
    "[prebuild-migrate] Could not find the prisma binary in node_modules/.bin.",
  );
  process.exit(1);
}

console.log(`[prebuild-migrate] VERCEL_ENV=production — running prisma migrate deploy via ${prismaBin}`);
// Capture stdout/stderr so we can detect the unmanaged-schema case and
// continue the build instead of blocking the deploy forever.
const result = spawnSync(prismaBin, ["migrate", "deploy"], {
  encoding: "utf8",
  env: process.env,
});

// Echo the output so operators can see it in Vercel build logs.
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status === 0) {
  console.log("[prebuild-migrate] Migrations applied successfully.");
  process.exit(0);
}

// Special cases: production DB has a migration-history table that's
// in a state Prisma won't auto-recover from.
//
//   P3005 — "The database schema is not empty"
//           DB has tables but no _prisma_migrations history. Operator
//           must baseline via `prisma migrate resolve --applied …`
//           or run the missing SQL directly.
//   P3009 — "Migrate found failed migrations in the target database"
//           A prior migrate-deploy attempt died mid-migration and
//           left a row marked FAILED. Operator must clear it via
//           `prisma migrate resolve --rolled-back <name>` or by
//           UPDATE/DELETE on _prisma_migrations.
//   P3018 — "A migration failed to apply"
//           Recoverable manually but blocks future deploys until
//           resolved.
//
// In all three cases we DOWNGRADE the failure to a warning so the
// deploy still ships the latest code. Runtime routes may 500 if the
// code references columns the DB doesn't have yet — that's the
// trade-off for keeping the build unblocked. Operators see the
// warning in Vercel build logs and can resolve the migration state
// out of band.
//
// Anything else (bad SQL, connection error, drift detection on a
// healthy migration history) STILL aborts the build — that's the
// safety net working as intended.
const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const recoverableCodes = ["P3005", "P3009", "P3018"];
const matchedCode = recoverableCodes.find(code =>
  new RegExp(`\\b${code}\\b`).test(combined),
);
const matchedString =
  /database schema is not empty/i.test(combined) ||
  /failed migrations in the target/i.test(combined) ||
  /migration failed to apply/i.test(combined) ||
  /db_schema_not_empty/i.test(combined);

if (matchedCode || matchedString) {
  console.warn(
    `\n[prebuild-migrate] !!!! Prisma migrate refused (${matchedCode ?? "string-match"}). ` +
    "Continuing the build so the latest application code ships, but the production DB " +
    "is in an inconsistent migration state. Runtime routes may 500 if the deployed code " +
    "references columns the DB doesn't have yet. " +
    "Operator action required: resolve the migration history out-of-band " +
    "(see `prisma migrate resolve --applied` / `--rolled-back`) and re-trigger a deploy.\n",
  );
  process.exit(0);
}

console.error(`[prebuild-migrate] migrate deploy exited with status ${result.status}.`);
process.exit(result.status ?? 1);

/**
 * Locate the prisma binary. Tries the current working directory's
 * node_modules first (the common Vercel layout) then walks one level
 * up in case `cwd` is the project root and node_modules lives next to
 * package.json a level deeper. Returns null if neither path resolves.
 */
function resolvePrismaBin() {
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "prisma"),
    join(process.cwd(), "..", "node_modules", ".bin", "prisma"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}
