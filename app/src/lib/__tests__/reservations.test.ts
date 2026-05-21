/**
 * Unit tests for reservation rate-limiting (now Upstash-backed via
 * rateLimitAsync — falls back to the in-memory map in dev / test).
 *
 * `checkConflict` overlap math is DB-backed and tested end-to-end via the
 * /api/v/[slug]/reservations route — leaving it out here on purpose to
 * keep `bun test` fast and Postgres-free.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// Sibling test files (signup-flow, staff-invite-flow, etc.) stub
// `@/lib/rate-limit` with a closure-bound `rateLimitAsync` that
// always returns `{ ok: true }`. Bun's `mock.module(...)` is
// process-wide; on macOS readdir is alphabetical so those files run
// AFTER us and nothing leaks, but on Linux CI readdir hands them to
// Bun BEFORE us and the always-ok stub silently breaks both rateCheck
// assertions ("4th call should refuse").
//
// Bun's docs are explicit: `mock.restore()` does NOT clear
// `mock.module()` overrides — only re-calling `mock.module()`
// undoes them. So we re-install our own controlled stub. What this
// test actually verifies is rateCheck's *key composition* (per-
// (slug,phone) isolation + per-key 4th-call refusal); the production
// rate-limit logic itself is covered by stripe-helpers.test.ts and
// integration tests. A faithful counting mock here exercises the
// same wrapper-level behaviour and is immune to upstream pollution.
type LimitOpts = { windowMs: number; max: number };
let calls: Array<{ key: string; opts: LimitOpts }> = [];

mock.module("@/lib/rate-limit", () => ({
  rateLimitAsync: async (key: string, opts: LimitOpts) => {
    calls.push({ key, opts });
    const count = calls.filter(c => c.key === key).length;
    return count <= opts.max
      ? { ok: true }
      : { ok: false, retryAfterMs: opts.windowMs };
  },
}));

let rateCheck!: (slug: string, phone: string) => Promise<boolean>;
beforeAll(async () => {
  ({ rateCheck } = await import("../reservations"));
});
beforeEach(() => {
  calls = [];
});

describe("rateCheck (Upstash-backed; falls back to in-memory in test)", () => {
  test("first 3 attempts in an hour pass; 4th refuses", async () => {
    // Use a unique phone so we don't collide with concurrent tests.
    const phone = "+1555" + Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0");
    expect(await rateCheck("ottos-lounge", phone)).toBe(true);
    expect(await rateCheck("ottos-lounge", phone)).toBe(true);
    expect(await rateCheck("ottos-lounge", phone)).toBe(true);
    expect(await rateCheck("ottos-lounge", phone)).toBe(false);
  });

  test("limit is per-(slug,phone) — same phone at a different venue is unaffected", async () => {
    const phone = "+1555" + Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0");
    await rateCheck("venue-a", phone);
    await rateCheck("venue-a", phone);
    await rateCheck("venue-a", phone);
    expect(await rateCheck("venue-a", phone)).toBe(false);
    expect(await rateCheck("venue-b", phone)).toBe(true);
  });
});
