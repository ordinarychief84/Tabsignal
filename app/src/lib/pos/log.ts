/**
 * Append-only writer for `PosSyncLog`.
 *
 * Every provider method funnels through here so we get a single chokepoint
 * that:
 *   1. Strips credential-like keys from request/response payloads before
 *      they hit Postgres. The schema column comment in `prisma/schema.prisma`
 *      explicitly forbids storing tokens — this is the enforcement.
 *   2. Coerces the payloads to a JSON-safe shape so Prisma's `Json` columns
 *      don't choke on `Date` / `Buffer` / undefined keys.
 *
 * Never read by the frontend directly — pages query `db.posSyncLog`
 * themselves with their own `select`.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const REDACT_KEY = /token|secret|password|apiKey|api_key|authorization/i;
const REDACTED = "[redacted]";

/**
 * Deep-clone the payload while replacing any value sitting under a key that
 * looks credential-shaped with `[redacted]`. Returns `null` on undefined so
 * the JSON column reads cleanly.
 */
function sanitize(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  // Hard depth cap. Protects against pathological cyclic objects without
  // pulling in a full structured-clone library.
  if (depth > 8) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return value as Prisma.InputJsonValue;
  }
  if (t === "bigint") return (value as bigint).toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map(v => sanitize(v, depth + 1))
      .filter((v): v is Prisma.InputJsonValue => v !== null);
  }
  if (t === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEY.test(k)) {
        out[k] = REDACTED;
        continue;
      }
      const clean = sanitize(v, depth + 1);
      if (clean !== null) out[k] = clean;
    }
    return out;
  }
  // Functions, symbols, etc. — drop.
  return null;
}

export async function logPosSync(
  venueId: string,
  provider: string,
  action: string,
  status: "success" | "error",
  request?: unknown,
  response?: unknown,
  errorMessage?: string | null,
): Promise<void> {
  try {
    await db.posSyncLog.create({
      data: {
        venueId,
        provider,
        action,
        status,
        requestPayloadSafe: sanitize(request) ?? undefined,
        responsePayloadSafe: sanitize(response) ?? undefined,
        errorMessage: errorMessage ?? null,
      },
    });
  } catch (err) {
    // Logging must never break the caller. Surface to stderr so the deploy
    // surfaces it in Vercel logs and move on — the actual POS operation
    // succeeded/failed on its own merit.
    // eslint-disable-next-line no-console
    console.error("[pos/log] failed to write PosSyncLog", err);
  }
}
