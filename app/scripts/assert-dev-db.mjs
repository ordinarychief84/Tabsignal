/**
 * Guard: local dev commands must not touch a remote database.
 *
 * History: local dev shared the production Supabase DATABASE_URL for
 * months. Every `prisma migrate dev`, seed experiment, or fat-fingered
 * Studio edit ran against live customer data — the P3009 migration
 * saga started exactly this way. This script front-runs `dev` and the
 * `db:*` package scripts and refuses to proceed when DATABASE_URL
 * points anywhere but localhost.
 *
 * Escape hatch (deliberate, rare): ALLOW_REMOTE_DB=1 for a consciously
 * remote operation, e.g. inspecting prod with `db:studio` during an
 * incident. The Vercel build path (scripts/prebuild-migrate.mjs) does
 * NOT run this guard — production deploys migrate remotely by design.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// This guard runs BEFORE `next dev`, so .env.local hasn't been loaded
// yet (Next loads it itself during startup). Mirror Next's precedence
// for the one variable we care about: real environment wins, then
// .env.local, then .env.
function envFileValue(name) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(path.resolve(here, "..", file), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`));
        if (m) return m[1].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file absent — keep looking */
    }
  }
  return "";
}

const raw = process.env.DATABASE_URL || envFileValue("DATABASE_URL");
if (!raw) {
  console.error(
    "[assert-dev-db] DATABASE_URL is not set.\n" +
    "  Start a local Postgres and point .env.local at it:\n" +
    "    DATABASE_URL=\"postgresql://localhost:5432/tabcall_dev\"\n" +
    "    DIRECT_URL=\"postgresql://localhost:5432/tabcall_dev\"\n" +
    "  Setup: brew services start postgresql@16 && createdb tabcall_dev\n" +
    "     or: docker compose -f docker-compose.dev.yml up -d\n" +
    "  Then: bun run db:deploy && bun run db:seed"
  );
  process.exit(1);
}

const host = hostOf(raw);
if (host && LOCAL_HOSTS.has(host)) process.exit(0);

if (process.env.ALLOW_REMOTE_DB === "1") {
  console.warn(
    `[assert-dev-db] ⚠ REMOTE DATABASE (${host ?? "unparseable"}) — proceeding because ALLOW_REMOTE_DB=1. ` +
    "You are touching shared data. Be certain."
  );
  process.exit(0);
}

console.error(
  `[assert-dev-db] Refusing: DATABASE_URL points at a REMOTE host (${host ?? "unparseable"}).\n` +
  "  Local dev runs against local Postgres only. Fix .env.local:\n" +
  "    DATABASE_URL=\"postgresql://localhost:5432/tabcall_dev\"\n" +
  "    DIRECT_URL=\"postgresql://localhost:5432/tabcall_dev\"\n" +
  "  First time? brew services start postgresql@16 && createdb tabcall_dev\n" +
  "              bun run db:deploy && bun run db:seed\n" +
  "  Genuinely need remote (incident inspection)? ALLOW_REMOTE_DB=1 bun run <cmd>"
);
process.exit(1);
