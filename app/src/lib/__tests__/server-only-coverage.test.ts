/**
 * Policy guard (security hardening pass): every module under src/lib
 * that references a server secret must carry `import "server-only"`,
 * so `next build` refuses to ever bundle it into a client component.
 * Same spirit as rls-coverage.test.ts — the test IS the policy.
 *
 * If this fails on a new module: add `import "server-only";` as its
 * first import (bun tests keep working via the preload shim in
 * _setup/mock-server-only.ts).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const LIB_DIR = path.resolve(import.meta.dir, "..");

// Env names whose values must never reach a browser bundle.
const SECRET_ENV_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "TWILIO_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "NEXTAUTH_SECRET",
  "INTERNAL_API_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "FIREBASE_PRIVATE_KEY",
  "DATABASE_URL",
  "GOOGLE_CLIENT_SECRET",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue; // tests may reference names in fixtures
      out.push(...walk(full));
    } else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("server-only coverage", () => {
  test("every lib module referencing a secret env imports server-only", () => {
    const offenders: string[] = [];
    for (const file of walk(LIB_DIR)) {
      const text = readFileSync(file, "utf8");
      const touchesSecret = SECRET_ENV_NAMES.some(name => text.includes(name));
      if (!touchesSecret) continue;
      if (!/^import "server-only";/m.test(text)) {
        offenders.push(path.relative(LIB_DIR, file));
      }
    }
    expect(
      offenders,
      `These lib modules read secret env vars but lack \`import "server-only"\`:\n  ${offenders.join("\n  ")}\n` +
      "Add it as the first import (see server-only-coverage.test.ts header).",
    ).toEqual([]);
  });

  test("no NEXT_PUBLIC_ env name smells like a secret", () => {
    const smells = /NEXT_PUBLIC_[A-Z_]*(SECRET|PRIVATE|SERVICE_ROLE|AUTH_TOKEN|PASSWORD)[A-Z_]*/;
    const offenders: string[] = [];
    for (const file of walk(path.resolve(LIB_DIR, ".."))) {
      const text = readFileSync(file, "utf8");
      const m = text.match(smells);
      if (m) offenders.push(`${path.relative(LIB_DIR, file)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
