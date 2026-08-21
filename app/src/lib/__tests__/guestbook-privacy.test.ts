/**
 * Guestbook: tenant isolation and phone exposure.
 *
 * The two failure modes here are the ones that end a SaaS company. One
 * venue reading another's guest list, and a server carrying a tray being
 * shown a stranger's phone number. Both are enforced in lib/guestbook
 * rather than in a template, so a rendering bug can't leak what the query
 * never returned.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Contact = {
  id: string;
  venueId: string;
  phone: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

const state: { contacts: Contact[]; lastWhere: Record<string, unknown> | null } = {
  contacts: [],
  lastWhere: null,
};

beforeEach(() => {
  state.contacts = [
    { id: "gc_1", venueId: "v_1", phone: "+12125551234", firstSeenAt: new Date("2026-01-01"), lastSeenAt: new Date("2026-08-01") },
    { id: "gc_2", venueId: "v_2", phone: "+12125559999", firstSeenAt: new Date("2026-02-01"), lastSeenAt: new Date("2026-08-02") },
  ];
  state.lastWhere = null;

  const decorate = (c: Contact) => ({
    ...c,
    _count: { visits: 3 },
    visits: [{ startedAt: c.lastSeenAt, rating: 5 }],
    feedback: [],
    consents: [],
    campaignRecipients: [],
  });

  mock.module("@/lib/db", () => ({
    db: {
      guestContact: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          state.lastWhere = where;
          return state.contacts.filter(c => c.venueId === where.venueId).map(decorate);
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          state.lastWhere = where;
          const found = state.contacts.find(
            c => c.id === where.id && c.venueId === where.venueId,
          );
          return found ? decorate(found) : null;
        },
        count: async () => 1,
      },
      marketingConsent: { count: async () => 0, findFirst: async () => null },
      guestVisit: { groupBy: async () => [] },
    },
  }));
});

afterEach(() => { mock.restore(); });

describe("tenant isolation", () => {
  test("a venue sees only its own guests", async () => {
    const { listGuests } = await import("../guestbook");
    const rows = await listGuests({ venueId: "v_1", role: "OWNER" });
    expect(rows.map(r => r.id)).toEqual(["gc_1"]);
    // The query is scoped, not the filtering afterwards.
    expect(state.lastWhere).toMatchObject({ venueId: "v_1" });
  });

  test("another venue's contact id returns null, not a 403 that confirms it exists", async () => {
    const { guestProfile } = await import("../guestbook");
    const profile = await guestProfile({ venueId: "v_1", contactId: "gc_2", role: "OWNER" });
    // Same answer as a contact that never existed — the id can't be used
    // to probe another venue's guest list.
    expect(profile).toBeNull();
  });

  test("a venue can open its own guest", async () => {
    const { guestProfile } = await import("../guestbook");
    const profile = await guestProfile({ venueId: "v_1", contactId: "gc_1", role: "OWNER" });
    expect(profile?.id).toBe("gc_1");
  });
});

describe("phone exposure", () => {
  test("owners and managers get the real number", async () => {
    const { listGuests } = await import("../guestbook");
    for (const role of ["OWNER", "MANAGER"]) {
      const rows = await listGuests({ venueId: "v_1", role });
      expect(rows[0]!.phone).toBe("+12125551234");
      expect(rows[0]!.phoneVisible).toBe(true);
    }
  });

  test("a server never receives the digits, even in the data layer", async () => {
    const { listGuests } = await import("../guestbook");
    const rows = await listGuests({ venueId: "v_1", role: "SERVER" });
    expect(rows[0]!.phoneVisible).toBe(false);
    expect(rows[0]!.phone).toBe("•••• 34");
    // The full number is never in the returned object, so a template can't
    // render it by mistake.
    expect(JSON.stringify(rows)).not.toContain("2125551234");
  });

  test("the same rule holds on the profile view", async () => {
    const { guestProfile } = await import("../guestbook");
    const asServer = await guestProfile({ venueId: "v_1", contactId: "gc_1", role: "SERVER" });
    expect(JSON.stringify(asServer)).not.toContain("2125551234");

    const asOwner = await guestProfile({ venueId: "v_1", contactId: "gc_1", role: "OWNER" });
    expect(asOwner!.phone).toBe("+12125551234");
  });

  test("HOST and VIEWER are masked too", async () => {
    const { listGuests } = await import("../guestbook");
    for (const role of ["HOST", "VIEWER"]) {
      const rows = await listGuests({ venueId: "v_1", role });
      expect(rows[0]!.phoneVisible).toBe(false);
    }
  });
});
