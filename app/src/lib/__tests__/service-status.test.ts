/**
 * What a guest is told about their own request.
 *
 * The distinction these tests defend is the whole reason the module
 * exists: "notified" and "on the way" are different promises, and only a
 * staff member pressing "Got it" is allowed to move a guest from the
 * first to the second. Get this wrong and the product tells someone their
 * server is walking over when nobody has looked at the screen — which
 * makes them wait longer before asking again, and makes the service worse
 * than saying nothing at all.
 *
 * ESCALATED is the subtle one. Internally it means the venue's clock ran
 * out; from the guest's chair nothing has changed and nobody has come, so
 * it must read as "notified" — never as "on the way", and never as its
 * own alarming state that announces the venue is struggling.
 */

import { describe, expect, test } from "bun:test";
import {
  requestTypeLabel,
  stageFor,
  statusDetail,
  statusHeadline,
  type GuestRequestStatus,
} from "@/lib/service-status";

describe("stageFor", () => {
  test("PENDING is 'notified' — passed on, nobody has seen it", () => {
    expect(stageFor("PENDING")).toBe("notified");
  });

  test("ACKNOWLEDGED means claimed, NOT coming", () => {
    // This is the split. A server carrying three plates who taps Got it
    // has seen the request; they are not crossing the room. Telling the
    // guest otherwise made them stop watching the door.
    expect(stageFor("ACKNOWLEDGED")).toBe("seen");
  });

  test("ON_MY_WAY is the only stage that means someone is coming", () => {
    expect(stageFor("ON_MY_WAY")).toBe("coming");
  });

  test("RESOLVED is done", () => {
    expect(stageFor("RESOLVED")).toBe("done");
  });

  test("ESCALATED still reads as 'notified' — nobody has come yet", () => {
    // Internally this means a manager was pulled in. To the guest it is
    // indistinguishable from waiting, and it must not imply arrival.
    expect(stageFor("ESCALATED")).toBe("notified");
  });
});

describe("statusHeadline", () => {
  test("names the server when the table has one", () => {
    expect(statusHeadline("notified", "Sarah")).toBe("Sarah has been notified");
    expect(statusHeadline("coming", "Sarah")).toBe("Sarah is on the way");
  });

  test("falls back to the team, never to an invented name", () => {
    expect(statusHeadline("notified", null)).toBe("The team has been notified");
    expect(statusHeadline("coming", null)).toBe("Someone is on the way");
  });

  test("only ON_MY_WAY ever claims someone is on the way", () => {
    // ACKNOWLEDGED is in this list on purpose: being claimed is not
    // being under way, and the whole point of the split is that nothing
    // before ON_MY_WAY may imply movement.
    const notMoving: GuestRequestStatus[] = ["PENDING", "ACKNOWLEDGED", "ESCALATED"];
    for (const status of notMoving) {
      for (const name of ["Sarah", null]) {
        const line = statusHeadline(stageFor(status), name);
        expect(line.toLowerCase()).not.toContain("on the way");
        expect(line.toLowerCase()).not.toContain("heading over");
      }
    }
  });

  test("the detail line makes the same promise as the headline", () => {
    // A headline that says "notified" over a detail that says "heading
    // over" is the same lie in smaller type.
    for (const stage of ["notified", "seen"] as const) {
      for (const name of ["Sarah", null]) {
        const detail = statusDetail(stage, name).toLowerCase();
        expect(detail).not.toContain("on the way");
        expect(detail).not.toContain("heading over");
      }
    }
    expect(statusDetail("coming", "Sarah").toLowerCase()).toContain("heading over");
  });

  test("'seen' says somebody has it without promising a moment", () => {
    // The honest middle: claimed, and no estimate anybody can stand
    // behind. It must not invent a time either.
    for (const name of ["Sarah", null]) {
      const line = statusHeadline("seen", name).toLowerCase();
      expect(line).not.toContain("on the way");
      expect(line).not.toMatch(/\d/);
      const detail = statusDetail("seen", name).toLowerCase();
      expect(detail).toContain("picked this up");
      expect(detail).not.toMatch(/\d+\s*(min|second)/);
    }
  });

  test("every stored status maps to a stage, and each stage has copy", () => {
    // A new enum member that nobody wired up renders a blank card.
    const all: GuestRequestStatus[] = [
      "PENDING", "ACKNOWLEDGED", "ON_MY_WAY", "RESOLVED", "ESCALATED",
    ];
    for (const status of all) {
      const stage = stageFor(status);
      expect(statusHeadline(stage, "Sarah").length).toBeGreaterThan(0);
      expect(statusDetail(stage, "Sarah").length).toBeGreaterThan(0);
    }
  });

  test("waiting copy tells the guest what happens next", () => {
    // "We told them" with no follow-up reads as a dead end; the guest
    // needs to know the screen will change on its own.
    for (const name of ["Sarah", null]) {
      expect(statusDetail("notified", name)).toContain("the moment");
    }
  });
});

describe("requestTypeLabel", () => {
  test("gives back the words the guest chose", () => {
    expect(requestTypeLabel("REFILL")).toBe("Water / refill");
    expect(requestTypeLabel("ORDER")).toBe("Ready to order");
  });

  test("never says 'pay' or 'bill' for the check signal", () => {
    // TabCall does not take money. The label a guest sees for BILL has to
    // stay a request for a person, not a payment action.
    const label = requestTypeLabel("BILL").toLowerCase();
    expect(label).toContain("check");
    expect(label).not.toContain("pay");
  });

  test("an unknown type degrades to something harmless", () => {
    expect(requestTypeLabel("SOMETHING_NEW")).toBe("Your request");
  });
});
