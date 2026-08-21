/**
 * Guest contacts: phone validation, and who is allowed to see a number.
 *
 * The exposure rule is the one worth pinning. A server needs to know that
 * table 12 wants water — not who is sitting there. If a phone number ever
 * reaches the floor app or a service alert, that's a privacy incident, so
 * the gate is a pure function with tests rather than a convention people
 * are expected to remember.
 */

import { describe, expect, test } from "bun:test";
import {
  canSeeGuestPhone,
  maskPhone,
  isValidPhone,
  normalizePhone,
} from "../guest-contacts";

describe("canSeeGuestPhone", () => {
  test("owners and managers can", () => {
    expect(canSeeGuestPhone("OWNER")).toBe(true);
    expect(canSeeGuestPhone("MANAGER")).toBe(true);
  });

  test("floor roles cannot", () => {
    // The server carrying the water does not get the guest's number.
    expect(canSeeGuestPhone("SERVER")).toBe(false);
    expect(canSeeGuestPhone("HOST")).toBe(false);
    expect(canSeeGuestPhone("VIEWER")).toBe(false);
  });

  test("legacy STAFF rows are treated as owners, as everywhere else", () => {
    expect(canSeeGuestPhone("STAFF")).toBe(true);
  });

  test("an unknown role is refused rather than allowed", () => {
    expect(canSeeGuestPhone("SOMETHING_NEW")).toBe(false);
  });
});

describe("maskPhone", () => {
  test("keeps only the last two digits", () => {
    expect(maskPhone("+12125551234")).toBe("•••• 34");
  });

  test("never leaks a short or malformed value", () => {
    expect(maskPhone("12")).toBe("•••");
    expect(maskPhone("")).toBe("•••");
  });
});

describe("isValidPhone", () => {
  test("accepts E.164", () => {
    expect(isValidPhone("+12125551234")).toBe(true);
    expect(isValidPhone("+442071838750")).toBe(true);
  });

  test("rejects anything else", () => {
    for (const bad of ["2125551234", "+0123456789", "not a phone", "", "+1", "+123456789012345678"]) {
      expect(isValidPhone(bad)).toBe(false);
    }
  });
});

describe("normalizePhone", () => {
  test("takes what a guest actually types on a keypad", () => {
    expect(normalizePhone("(212) 555-1234")).toBe("+12125551234");
    expect(normalizePhone("212.555.1234")).toBe("+12125551234");
    expect(normalizePhone("212 555 1234")).toBe("+12125551234");
  });

  test("respects an explicit + prefix over the venue default", () => {
    expect(normalizePhone("+44 20 7183 8750", "1")).toBe("+442071838750");
  });

  test("handles 00 and a national trunk 0", () => {
    expect(normalizePhone("0044 20 7183 8750")).toBe("+442071838750");
    expect(normalizePhone("020 7183 8750", "44")).toBe("+442071838750");
  });

  test("uses the venue's country rather than assuming US", () => {
    // "Across the board" — a venue outside the US must not have its guests'
    // numbers silently prefixed +1.
    expect(normalizePhone("20 7183 8750", "44")).toBe("+442071838750");
  });

  test("returns null rather than guessing at junk", () => {
    // A wrong number is worse than no number: it's someone else's phone.
    for (const bad of ["", "   ", "abc", "12"]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});
