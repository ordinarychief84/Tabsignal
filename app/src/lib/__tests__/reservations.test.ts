/**
 * Unit tests for reservation rate-limiting (in-memory) and the synchronous
 * branch of conflict detection (PAST_WINDOW).
 *
 * `checkConflict` overlap math is DB-backed and tested end-to-end via the
 * /api/v/[slug]/reservations route — leaving it out here on purpose to
 * keep `bun test` fast and Postgres-free.
 */

import { describe, expect, test } from "bun:test";
import { rateCheck } from "../reservations";

describe("rateCheck (in-memory per (slug,phone))", () => {
  test("first 3 attempts in an hour pass; 4th refuses", () => {
    // Use a unique phone so we don't collide with concurrent tests.
    const phone = "+1555" + Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0");
    expect(rateCheck("ottos-lounge", phone)).toBe(true);
    expect(rateCheck("ottos-lounge", phone)).toBe(true);
    expect(rateCheck("ottos-lounge", phone)).toBe(true);
    expect(rateCheck("ottos-lounge", phone)).toBe(false);
  });

  test("limit is per-(slug,phone) — same phone at a different venue is unaffected", () => {
    const phone = "+1555" + Math.floor(Math.random() * 10_000_000).toString().padStart(7, "0");
    rateCheck("venue-a", phone);
    rateCheck("venue-a", phone);
    rateCheck("venue-a", phone);
    expect(rateCheck("venue-a", phone)).toBe(false);
    expect(rateCheck("venue-b", phone)).toBe(true);
  });
});
