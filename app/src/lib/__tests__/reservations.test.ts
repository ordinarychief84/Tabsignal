/**
 * Unit tests for reservation rate-limiting (now Upstash-backed via
 * rateLimitAsync — falls back to the in-memory map in dev / test).
 *
 * `checkConflict` overlap math is DB-backed and tested end-to-end via the
 * /api/v/[slug]/reservations route — leaving it out here on purpose to
 * keep `bun test` fast and Postgres-free.
 */

import { beforeAll, describe, expect, mock, test } from "bun:test";

// Bun's `mock.module(...)` is process-wide and persistent — once a
// sibling test file (signup-flow, staff-invite-flow, etc.) stubs
// `@/lib/rate-limit`, the stub leaks into every subsequent file unless
// it cleans up. On macOS readdir is alphabetical so those files run
// AFTER reservations and we never notice; on Linux CI readdir hands
// them to Bun BEFORE us, the stubbed `rateLimitAsync` always returns
// `{ ok: true }`, and both rateCheck assertions silently break.
//
// Fix: call mock.restore() THEN dynamic-import `../reservations`.
// A static top-level import would have already captured the stubbed
// rateLimitAsync at file-load time, so restoring afterwards wouldn't
// help — the module's binding is already poisoned. The dynamic
// import re-evaluates `../reservations` against the real rate-limit
// module that mock.restore() just brought back.
let rateCheck!: (slug: string, phone: string) => Promise<boolean>;

beforeAll(async () => {
  mock.restore();
  ({ rateCheck } = await import("../reservations"));
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
