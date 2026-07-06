/**
 * Bootstrap a FRESH local database to the full schema.
 *
 *   bun run db:bootstrap        (then: bun run db:seed)
 *
 * Why this exists: the migration chain contains one file
 * (20260510_rbac_audit_log_phase1) that adds StaffRole enum values and
 * uses one in the same transaction — Postgres 55P04 makes that
 * unreplayable on an empty database, and Prisma offers no per-migration
 * transaction opt-out. Production predates the problem (it was
 * baselined via scripts/baseline-prod.sql), so we keep the historical
 * file untouched and instead: replay up to the poison migration, apply
 * its statements in two commits (scripts/bootstrap/*.sql), mark it
 * applied, and let `migrate deploy` finish the rest.
 *
 * Localhost-only by design — run assert-dev-db first (the db:bootstrap
 * package script does). Also used by the CI integration-test tier.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const prisma = ["node_modules/.bin/prisma", "../node_modules/.bin/prisma"]
  .map(p => path.resolve(appDir, p))
  .find(existsSync);
if (!prisma) {
  console.error("[bootstrap-dev-db] prisma binary not found — run bun install first");
  process.exit(1);
}

// Migrations that cannot replay verbatim on a fresh database, each with
// a fresh-DB-safe equivalent in scripts/bootstrap/. Historical files
// stay byte-identical (production's migration table references them);
// we apply the variant and mark the original applied.
//
//   20260510: adds StaffRole enum values and uses one in the same
//             transaction (Postgres 55P04) → split into two commits.
//   20260515: enables RLS on 29 named tables, two of which
//             (EmailTemplate, PlatformConfig) only ever existed on prod
//             (Studio era, not in schema.prisma) → existence-guarded loop.
const POISON = [
  {
    name: "20260510_rbac_audit_log_phase1",
    files: [
      "scripts/bootstrap/20260510-part1-enums.sql",
      "scripts/bootstrap/20260510-part2-rest.sql",
    ],
  },
  {
    name: "20260515_enable_rls_legacy_tables",
    files: ["scripts/bootstrap/20260515-rls-guarded.sql"],
  },
];

function run(args, opts = {}) {
  return execFileSync(prisma, args, { cwd: appDir, stdio: "pipe", ...opts }).toString();
}

function deploy() {
  try {
    const out = run(["migrate", "deploy"]);
    return { ok: true, out };
  } catch (err) {
    const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    return { ok: false, out };
  }
}

// Replay the chain, patching known-unreplayable migrations as we hit
// them. Bounded by the poison list so a genuinely new failure aborts.
let passes = 0;
for (;;) {
  console.log(`[bootstrap-dev-db] migrate deploy (pass ${++passes})…`);
  const result = deploy();
  if (result.ok) {
    console.log("[bootstrap-dev-db] done — schema is current. Next: bun run db:seed");
    process.exit(0);
  }
  const poison = POISON.find(p => result.out.includes(p.name));
  if (!poison || passes > POISON.length + 1) {
    console.error("[bootstrap-dev-db] migrate deploy failed for an unexpected reason:\n" + result.out);
    process.exit(1);
  }
  console.log(`[bootstrap-dev-db] hit known-unreplayable ${poison.name} — applying variant…`);
  run(["migrate", "resolve", "--rolled-back", poison.name]);
  for (const file of poison.files) run(["db", "execute", "--file", file]);
  run(["migrate", "resolve", "--applied", poison.name]);
  console.log(`[bootstrap-dev-db] ${poison.name} applied via variant + marked applied.`);
}
