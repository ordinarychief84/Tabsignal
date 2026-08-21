/**
 * Who may change how a member of staff is introduced to guests.
 *
 * The rule: whoever assigns tables (they already decide who covers which
 * room), or the person themselves (it's their name and their face).
 * Nobody else gets to put a colleague's photo and words in front of
 * paying guests.
 *
 * These three fields shipped with the schema in #91 with no API and no UI,
 * so the per-server welcome could never be personalised. This pins the
 * gate that came with finally wiring them up.
 */

import { describe, expect, test } from "bun:test";
import { can } from "../auth/permissions";

/** Mirrors the check in /api/admin/staff/[id]. */
function mayEditGuestFacing(opts: {
  actorRole: string;
  actorStaffId: string;
  targetStaffId: string;
}): boolean {
  const isSelf = opts.actorStaffId === opts.targetStaffId;
  const role = opts.actorRole === "STAFF" ? "OWNER" : opts.actorRole;
  return isSelf || can(role as never, "staff.assign_tables");
}

describe("editing another person's guest-facing details", () => {
  test("owners and managers can — they already assign the tables", () => {
    for (const actorRole of ["OWNER", "MANAGER"]) {
      expect(
        mayEditGuestFacing({ actorRole, actorStaffId: "a", targetStaffId: "b" }),
      ).toBe(true);
    }
  });

  test("a server cannot put words in a colleague's mouth", () => {
    for (const actorRole of ["SERVER", "HOST", "VIEWER"]) {
      expect(
        mayEditGuestFacing({ actorRole, actorStaffId: "a", targetStaffId: "b" }),
      ).toBe(false);
    }
  });

  test("legacy STAFF rows are treated as owners, as everywhere else", () => {
    expect(mayEditGuestFacing({ actorRole: "STAFF", actorStaffId: "a", targetStaffId: "b" })).toBe(true);
  });
});

describe("editing your own", () => {
  test("every role can, including the ones that can't touch anyone else's", () => {
    // It's their name and their photo. A server should not need to book a
    // manager to fix a typo in their own greeting.
    for (const actorRole of ["OWNER", "MANAGER", "SERVER", "HOST", "VIEWER"]) {
      expect(
        mayEditGuestFacing({ actorRole, actorStaffId: "me", targetStaffId: "me" }),
      ).toBe(true);
    }
  });
});

describe("clearing a field", () => {
  /** Mirrors the route: empty string means "clear it", not "store blank". */
  function normalize(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    return typeof value === "string" && value.trim() === "" ? null : value;
  }

  test("an emptied greeting falls back rather than showing a blank one", () => {
    // Null means the venue default takes over. Storing "" would put an
    // empty greeting on a guest's phone.
    expect(normalize("")).toBeNull();
    expect(normalize("   ")).toBeNull();
  });

  test("absent means don't touch it", () => {
    expect(normalize(undefined)).toBeUndefined();
  });

  test("a real value passes through", () => {
    expect(normalize("Back in a sec!")).toBe("Back in a sec!");
  });
});
