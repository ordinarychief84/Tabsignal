/**
 * Shift status, and what it does to routing.
 *
 * ONE RULE ABOVE ALL OTHERS: A REQUEST MUST NEVER GO SILENT.
 *
 * The obvious implementation — filter to staff who are on shift — fails
 * in the case that matters most. A table whose only assigned server
 * steps outside for two minutes would route that guest's request to
 * nobody, and nobody is precisely the outcome this product exists to
 * prevent. A guest who gets no response concludes the app doesn't work,
 * which is worse than never having scanned.
 *
 * So availability is a PREFERENCE. On-shift staff are tried first, away
 * staff still receive their own tables' requests when nobody else can,
 * and if the alternative is silence then everyone gets it regardless of
 * state. These tests exist to stop someone "tidying" that into a filter.
 */

import { describe, expect, test } from "bun:test";
import {
  SHIFT_HINTS,
  SHIFT_LABELS,
  SHIFT_STATUSES,
  isAvailable,
  isAway,
  offShiftWarning,
  routeTo,
  type ShiftStatus,
} from "@/lib/shift";

const on = (id: string) => ({ id, shiftStatus: "ON_SHIFT" as ShiftStatus });
const brk = (id: string) => ({ id, shiftStatus: "BREAK" as ShiftStatus });
const meal = (id: string) => ({ id, shiftStatus: "MEAL_BREAK" as ShiftStatus });
const off = (id: string) => ({ id, shiftStatus: "OFF_SHIFT" as ShiftStatus });

describe("availability predicates", () => {
  test("only ON_SHIFT counts as available", () => {
    expect(isAvailable("ON_SHIFT")).toBe(true);
    for (const s of ["BREAK", "MEAL_BREAK", "OFF_SHIFT"] as ShiftStatus[]) {
      expect(isAvailable(s)).toBe(false);
    }
  });

  test("both breaks count as away; off shift does not", () => {
    // Away means "still the fallback for their own tables". Off shift
    // means "route past them while anyone else can take it".
    expect(isAway("BREAK")).toBe(true);
    expect(isAway("MEAL_BREAK")).toBe(true);
    expect(isAway("ON_SHIFT")).toBe(false);
    expect(isAway("OFF_SHIFT")).toBe(false);
  });
});

describe("routeTo — the normal cases", () => {
  test("goes to the assigned server who is on shift", () => {
    const r = routeTo([on("a"), off("b")], [on("c")]);
    expect(r.staffIds).toEqual(["a"]);
    expect(r.fallback).toBe(false);
  });

  test("goes to every assigned server who is on shift", () => {
    const r = routeTo([on("a"), on("b")], [on("c")]);
    expect(r.staffIds.sort()).toEqual(["a", "b"]);
    expect(r.fallback).toBe(false);
  });

  test("an on-shift assignment beats an on-shift stranger", () => {
    // The person who knows the table should get it, not whoever is
    // nearest the door.
    const r = routeTo([on("a")], [on("c"), on("d")]);
    expect(r.staffIds).toEqual(["a"]);
  });
});

describe("routeTo — nobody assigned is on shift", () => {
  test("reaches an assigned server who is on a break", () => {
    // Better than nobody. Their table, their guest.
    const r = routeTo([brk("a")], []);
    expect(r.staffIds).toEqual(["a"]);
    expect(r.fallback).toBe(true);
  });

  test("a break beats sending it to the wider floor", () => {
    const r = routeTo([brk("a")], [on("c")]);
    expect(r.staffIds).toEqual(["a"]);
  });

  test("meal break behaves exactly like a break for routing", () => {
    // The difference is for the manager reading the floor, not the router.
    expect(routeTo([meal("a")], [on("c")]).staffIds).toEqual(["a"]);
  });

  test("an assigned server who is OFF shift is passed over for the floor", () => {
    // Off shift means gone. Someone on shift should get it instead.
    const r = routeTo([off("a")], [on("c")]);
    expect(r.staffIds).toEqual(["c"]);
    expect(r.fallback).toBe(true);
  });

  test("an unassigned table goes to whoever is on shift", () => {
    const r = routeTo([], [on("c"), off("d")]);
    expect(r.staffIds).toEqual(["c"]);
  });
});

describe("routeTo — the silence guard", () => {
  test("nobody on shift anywhere still reaches the assigned server", () => {
    // The case a naive filter breaks: one server, off shift, guest wants
    // water. It has to land somewhere.
    const r = routeTo([off("a")], [off("c")]);
    expect(r.staffIds).toEqual(["a"]);
    expect(r.fallback).toBe(true);
  });

  test("an unassigned table with nobody on shift reaches the whole venue", () => {
    const r = routeTo([], [off("c"), off("d")]);
    expect(r.staffIds.sort()).toEqual(["c", "d"]);
  });

  test("NO combination of states ever produces an empty recipient list", () => {
    // Exhaustive over every state pairing, with and without an
    // assignment. If any of these returns [], a guest request lands
    // nowhere — which is the one failure this module exists to prevent.
    for (const a of SHIFT_STATUSES) {
      for (const c of SHIFT_STATUSES) {
        const withAssignment = routeTo(
          [{ id: "a", shiftStatus: a }],
          [{ id: "c", shiftStatus: c }],
        );
        expect(withAssignment.staffIds.length).toBeGreaterThan(0);

        const withoutAssignment = routeTo([], [{ id: "c", shiftStatus: c }]);
        expect(withoutAssignment.staffIds.length).toBeGreaterThan(0);
      }
    }
  });

  test("the truly empty venue returns empty rather than inventing someone", () => {
    // Nobody employed, nobody assigned. The row still gets written and
    // the venue room still receives it — there is simply no individual
    // to name, and fabricating one would be worse.
    expect(routeTo([], []).staffIds).toEqual([]);
  });

  test("fallback is flagged whenever the request missed its first choice", () => {
    expect(routeTo([on("a")], []).fallback).toBe(false);
    expect(routeTo([brk("a")], []).fallback).toBe(true);
    expect(routeTo([off("a")], [on("c")]).fallback).toBe(true);
    expect(routeTo([off("a")], [off("c")]).fallback).toBe(true);
  });
});

describe("going off shift warns rather than blocks", () => {
  test("open work is named, with correct plural agreement", () => {
    expect(
      offShiftWarning({ openRequests: 1, assignedTables: 3, otherStaffOnShift: 2 }),
    ).toContain("1 request still open");
    expect(
      offShiftWarning({ openRequests: 4, assignedTables: 3, otherStaffOnShift: 2 }),
    ).toContain("4 requests still open");
  });

  test("being the last one on shift with tables is worth saying", () => {
    const w = offShiftWarning({ openRequests: 0, assignedTables: 2, otherStaffOnShift: 0 });
    expect(w).not.toBeNull();
    expect(w).toContain("only one on shift");
    // And it tells the truth about what happens next: those requests
    // still reach them, because routing never goes silent.
    expect(w).toContain("still reach you");
  });

  test("a clean handover warns about nothing", () => {
    expect(
      offShiftWarning({ openRequests: 0, assignedTables: 4, otherStaffOnShift: 3 }),
    ).toBeNull();
    expect(
      offShiftWarning({ openRequests: 0, assignedTables: 0, otherStaffOnShift: 0 }),
    ).toBeNull();
  });

  test("it is advisory — nothing here can refuse", () => {
    // The return type is a string or null. There is no shape of result
    // that blocks, because a product that refuses would simply get lied
    // to: the server walks out anyway and the floor plan goes stale.
    const w = offShiftWarning({ openRequests: 9, assignedTables: 9, otherStaffOnShift: 0 });
    expect(typeof w).toBe("string");
  });
});

describe("copy", () => {
  test("every state has a label and a hint", () => {
    for (const s of SHIFT_STATUSES) {
      expect(SHIFT_LABELS[s]?.length).toBeGreaterThan(0);
      expect(SHIFT_HINTS[s]?.length).toBeGreaterThan(0);
    }
  });

  test("the hints describe what happens to requests, not the state's name", () => {
    // A server picking a state mid-service needs to know the
    // consequence, not a synonym.
    for (const s of SHIFT_STATUSES) {
      expect(SHIFT_HINTS[s].toLowerCase()).toContain("request");
    }
  });

  test("no hint promises that requests stop entirely", () => {
    // Because they don't — see the silence guard above. Saying "you'll
    // get nothing" would be a lie a server plans their break around.
    for (const s of SHIFT_STATUSES) {
      const h = SHIFT_HINTS[s].toLowerCase();
      expect(h).not.toContain("no requests");
      expect(h).not.toContain("nothing will");
    }
  });
});
