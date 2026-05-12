/**
 * Unit tests for reservation rate-limiting (now Upstash-backed via
 * rateLimitAsync — falls back to the in-memory map in dev / test).
 *
 * `checkConflict` overlap math is DB-backed and tested end-to-end via the
 * /api/v/[slug]/reservations route — leaving it out here on purpose to
 * keep `bun test` fast and Postgres-free.
 */

import { describe, expect, test } from "bun:test";
import { rateCheck } from "../reservations";

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
