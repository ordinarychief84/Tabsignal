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

const env = process.env.VERCEL_ENV ?? "(unset)";

if (env !== "production") {
  console.log(`[prebuild-migrate] Skipping prisma migrate deploy (VERCEL_ENV=${env}).`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[prebuild-migrate] DATABASE_URL is missing on a production build — aborting.");
  process.exit(1);
}

console.log("[prebuild-migrate] VERCEL_ENV=production — running prisma migrate deploy.");
const result = spawnSync("bunx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error(`[prebuild-migrate] migrate deploy exited with status ${result.status}.`);
  process.exit(result.status ?? 1);
}

console.log("[prebuild-migrate] Migrations applied successfully.");
