/**
 * Marketing consent — the rules that decide who may legally be texted.
 *
 * These are pinned harder than most of the codebase because the failure
 * mode isn't a broken page, it's a venue messaging people who never agreed
 * and finding out via a TCPA complaint. The properties that matter:
 *
 *   - a phone number on its own grants nothing
 *   - declining is recorded, and is not consent
 *   - opting out survives everything except a fresh, explicit opt-in
 *   - the exact wording shown is stored with the decision
 *   - one venue's list can never contain another venue's guests
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type ConsentRow = {
  id: string;
  guestContactId: string;
  venueId: string;
  status: "PENDING" | "SUBSCRIBED" | "UNSUBSCRIBED";
  consentTextVersion: string | null;
  consentSource: string | null;
  consentedAt: Date | null;
  optedOutAt: Date | null;
};

const state: { rows: ConsentRow[]; seq: number } = { rows: [], seq: 0 };

beforeEach(() => {
  state.rows = [];
  state.seq = 0;

  mock.module("@/lib/db", () => ({
    db: {
      marketingConsent: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          state.rows.find(
            r =>
              r.guestContactId === where.guestContactId && r.venueId === where.venueId,
          ) ?? null,
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          state.rows.filter(
            r =>
              r.venueId === where.venueId &&
              (where.status === undefined || r.status === where.status) &&
              (where.optedOutAt === undefined || r.optedOutAt === where.optedOutAt),
          ),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `mc_${++state.seq}`, optedOutAt: null, ...data } as ConsentRow;
          state.rows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = state.rows.find(r => r.id === where.id)!;
          Object.assign(row, data);
          return row;
        },
      },
    },
  }));
});

afterEach(() => { mock.restore(); });

describe("recordConsent", () => {
  test("declining is recorded as PENDING, never as consent", async () => {
    const { recordConsent, marketableContactIds } = await import("../consent");
    await recordConsent({
      guestContactId: "gc_1",
      venueId: "v_1",
      granted: false,
      source: "post_visit_feedback",
    });
    expect(state.rows[0]!.status).toBe("PENDING");
    expect(state.rows[0]!.consentedAt).toBeNull();
    // The whole point: a number we hold is not a number we may text.
    expect(await marketableContactIds("v_1")).toEqual([]);
  });

  test("granting stores the exact wording version that was shown", async () => {
    const { recordConsent, CONSENT_TEXT_VERSION } = await import("../consent");
    await recordConsent({
      guestContactId: "gc_1",
      venueId: "v_1",
      granted: true,
      source: "post_visit_feedback",
    });
    const row = state.rows[0]!;
    expect(row.status).toBe("SUBSCRIBED");
    expect(row.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
    expect(row.consentSource).toBe("post_visit_feedback");
    expect(row.consentedAt).toBeInstanceOf(Date);
  });

  test("a second decision updates in place rather than stacking rows", async () => {
    const { recordConsent } = await import("../consent");
    await recordConsent({ guestContactId: "gc_1", venueId: "v_1", granted: false, source: "post_visit_feedback" });
    await recordConsent({ guestContactId: "gc_1", venueId: "v_1", granted: true, source: "post_visit_feedback" });
    // Two rows would make "are they subscribed?" ambiguous.
    expect(state.rows.length).toBe(1);
    expect(state.rows[0]!.status).toBe("SUBSCRIBED");
  });
});

describe("optOut", () => {
  test("removes them from the marketable list", async () => {
    const { recordConsent, optOut, marketableContactIds } = await import("../consent");
    await recordConsent({ guestContactId: "gc_1", venueId: "v_1", granted: true, source: "post_visit_feedback" });
    expect(await marketableContactIds("v_1")).toEqual(["gc_1"]);

    await optOut({ guestContactId: "gc_1", venueId: "v_1" });
    expect(await marketableContactIds("v_1")).toEqual([]);
    expect(state.rows[0]!.optedOutAt).toBeInstanceOf(Date);
  });

  test("works for a contact that never had a consent row", async () => {
    // STOP from someone we only ever held a number for still has to stick.
    const { optOut, consentStatusFor } = await import("../consent");
    await optOut({ guestContactId: "gc_new", venueId: "v_1" });
    expect(await consentStatusFor("gc_new", "v_1")).toBe("UNSUBSCRIBED");
  });

  test("an opt-out row can never leak into a send list, even if status is wrong", async () => {
    // Defence in depth: if a bug ever wrote SUBSCRIBED over an opt-out,
    // the opt-out date still wins.
    const { marketableContactIds, consentStatusFor } = await import("../consent");
    state.rows.push({
      id: "mc_x",
      guestContactId: "gc_1",
      venueId: "v_1",
      status: "SUBSCRIBED",
      consentTextVersion: "v1",
      consentSource: "import",
      consentedAt: new Date(),
      optedOutAt: new Date(),
    });
    expect(await marketableContactIds("v_1")).toEqual([]);
    expect(await consentStatusFor("gc_1", "v_1")).toBe("UNSUBSCRIBED");
  });
});

describe("tenant isolation", () => {
  test("consent at one venue is not consent at another", async () => {
    const { recordConsent, marketableContactIds, consentStatusFor } = await import("../consent");
    await recordConsent({ guestContactId: "gc_1", venueId: "v_1", granted: true, source: "post_visit_feedback" });

    expect(await marketableContactIds("v_1")).toEqual(["gc_1"]);
    // The same human, a different restaurant. They agreed to hear from one.
    expect(await marketableContactIds("v_2")).toEqual([]);
    expect(await consentStatusFor("gc_1", "v_2")).toBe("PENDING");
  });

  test("opting out of one venue leaves the other subscription intact", async () => {
    const { recordConsent, optOut, marketableContactIds } = await import("../consent");
    await recordConsent({ guestContactId: "gc_1", venueId: "v_1", granted: true, source: "post_visit_feedback" });
    await recordConsent({ guestContactId: "gc_2", venueId: "v_2", granted: true, source: "post_visit_feedback" });

    await optOut({ guestContactId: "gc_1", venueId: "v_1" });
    expect(await marketableContactIds("v_1")).toEqual([]);
    expect(await marketableContactIds("v_2")).toEqual(["gc_2"]);
  });
});

describe("consent text", () => {
  test("names the venue doing the messaging and how to stop", async () => {
    const { consentText } = await import("../consent");
    // Works for any venue — the venue name is a parameter, never baked in.
    for (const venue of ["Luna", "The Local Dev Taproom", "Otto's Lounge"]) {
      const text = consentText(venue);
      expect(text).toContain(venue);
      expect(text).toContain("STOP");
      expect(text.toLowerCase()).toContain("message and data rates");
    }
  });
});
