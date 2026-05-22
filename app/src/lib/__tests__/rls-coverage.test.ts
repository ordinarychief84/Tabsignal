/**
 * Regression guard for Row-Level Security coverage.
 *
 * Background
 * ----------
 * Supabase's PostgREST exposes /rest/v1/<table> to anyone with the anon
 * key — which the browser-side Supabase client publishes. Without RLS,
 * every public-schema table is readable / writable via that endpoint.
 * The Prisma client connects through a BYPASSRLS Postgres role so app
 * traffic is unaffected when RLS is enabled with NO permissive
 * policies. That's the posture migration 20260515_enable_rls_legacy_tables
 * established: enable RLS on every table, install no policies. The
 * effect is "deny all via REST".
 *
 * What this test enforces
 * -----------------------
 * For every model in schema.prisma, at least one migration must contain
 *   ALTER TABLE "<ModelName>" ENABLE ROW LEVEL SECURITY;
 *
 * If someone adds a new model without enabling RLS — accidentally
 * re-opening the REST hole — this test fails and points at the offender
 * by name. The remediation is to add an `ENABLE ROW LEVEL SECURITY`
 * statement to that model's migration.
 *
 * Scope
 * -----
 * The test deliberately does NOT check that policies are absent (we
 * may add per-tenant policies later; deny-by-default is the current
 * posture). It also does not validate the policies are correct at
 * runtime — that needs a real Postgres connection and lives in the
 * deferred integration test suite.
 *
 * Known exemptions
 * ----------------
 * `LinkTokenUse` is the magic-link single-use enforcement table.
 * We exempt nothing else by default. Add to EXEMPT only when the table
 * is truly internal (never user-derived, no PII).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SCHEMA_PATH = join(import.meta.dir, "../../../prisma/schema.prisma");
const MIGRATIONS_DIR = join(import.meta.dir, "../../../prisma/migrations");

/**
 * Pull every `model X {` from schema.prisma. We deliberately ignore
 * enums (`enum X {`) and skip view/non-table models if any appear
 * later (none exist yet — flag if a future schema adds them).
 */
function extractModelNames(): string[] {
  const src = readFileSync(SCHEMA_PATH, "utf8");
  const names: string[] = [];
  for (const line of src.split("\n")) {
    const m = /^model\s+(\w+)\s*\{/.exec(line.trim());
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * Walk every migration SQL file and collect the set of tables that
 * have RLS enabled. Both quoted ("Venue") and unquoted (venue) forms
 * are normalised to the model name's canonical form. Migrations that
 * later DISABLE RLS aren't excluded by this — that would be a real
 * regression worth flagging in a separate test if it ever happens.
 */
function tablesWithRlsEnabled(): Set<string> {
  const enabled = new Set<string>();
  const files = readdirSync(MIGRATIONS_DIR);
  for (const dir of files) {
    const fullPath = join(MIGRATIONS_DIR, dir);
    if (!statSync(fullPath).isDirectory()) continue;
    const sqlPath = join(fullPath, "migration.sql");
    let sql: string;
    try {
      sql = readFileSync(sqlPath, "utf8");
    } catch {
      continue;
    }
    // Match: ALTER TABLE "Name" ENABLE ROW LEVEL SECURITY;
    //    OR: alter table name enable row level security;
    const re = /ALTER\s+TABLE\s+"?([A-Za-z_]\w*)"?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
    let match;
    while ((match = re.exec(sql)) !== null) {
      enabled.add(match[1]);
    }
  }
  return enabled;
}

/** Models we explicitly do not require RLS on. Empty for now — the
 *  default policy is "every table". Add entries with a justification
 *  comment if a table is truly internal-only. */
const EXEMPT_MODELS: ReadonlySet<string> = new Set([]);

describe("RLS coverage", () => {
  test("every Prisma model has ENABLE ROW LEVEL SECURITY in some migration", () => {
    const models = extractModelNames();
    const rlsEnabled = tablesWithRlsEnabled();

    expect(models.length).toBeGreaterThan(20); // sanity: schema isn't empty

    const missing = models.filter(
      m => !EXEMPT_MODELS.has(m) && !rlsEnabled.has(m),
    );

    // Print a useful message: which models are missing, with the
    // migration command the dev should run.
    if (missing.length > 0) {
      const msg = [
        "",
        "RLS is not enabled on the following Prisma models:",
        ...missing.map(m => `  - ${m}`),
        "",
        "Add to a new or existing migration:",
        ...missing.map(m => `  ALTER TABLE "${m}" ENABLE ROW LEVEL SECURITY;`),
        "",
        "Or add to EXEMPT_MODELS in rls-coverage.test.ts with justification.",
      ].join("\n");
      throw new Error(msg);
    }

    expect(missing).toEqual([]);
  });

  test("RLS migration list is comprehensive — every enabled table corresponds to a real model", () => {
    // Inverse check: if a migration enables RLS on a table that no
    // longer has a model, the migration is stale and probably
    // references a renamed/dropped table — worth flagging.
    //
    // Known orphans (RLS enabled but no Prisma model):
    //   EmailTemplate — was modelled pre-Phase-2; the live table was
    //     subsumed by the static-template approach in lib/auth/email.ts.
    //     RLS left enabled defensively so the dormant table can't be
    //     queried via PostgREST if the DB still has it.
    //   PlatformConfig — Supabase-managed feature-flags table created
    //     pre-Prisma; never modelled. RLS-enabled posture is intentional.
    const knownOrphans = new Set(["EmailTemplate", "PlatformConfig"]);
    const models = new Set(extractModelNames());
    const rlsEnabled = tablesWithRlsEnabled();
    const orphans = [...rlsEnabled].filter(t => !models.has(t) && !knownOrphans.has(t));
    expect(orphans).toEqual([]);
  });
});
