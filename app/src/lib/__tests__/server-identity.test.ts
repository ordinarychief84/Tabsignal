/**
 * Who the guest is told is looking after them.
 *
 * Two things under test. The welcome-message priority chain (server's own
 * words, then the venue's, then TabCall's), and the exposure boundary: a
 * StaffMember row holds a legal name, an email and a role, and the shape
 * this returns must not carry any of it onto a stranger's phone.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type StaffStub = {
  id: string;
  name: string;
  displayName: string | null;
  photoUrl: string | null;
  welcomeMessage: string | null;
};

const state: { assigned: StaffStub | null; lastWhere: Record<string, unknown> | null } = {
  assigned: null,
  lastWhere: null,
};

beforeEach(() => {
  state.assigned = null;
  state.lastWhere = null;
  mock.module("@/lib/db", () => ({
    db: {
      tableAssignment: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          state.lastWhere = where;
          return state.assigned ? { staff: state.assigned } : null;
        },
      },
    },
  }));
});

afterEach(() => { mock.restore(); });

const SARAH: StaffStub = {
  id: "stf_1",
  name: "Sarah Okonkwo",
  displayName: "Sarah",
  photoUrl: null,
  welcomeMessage: null,
};

describe("serverForTable", () => {
  test("returns only what a guest may see", async () => {
    state.assigned = SARAH;
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({ tableId: "t_1", venueName: "Luna" });
    expect(server!.displayName).toBe("Sarah");
    // The surname, and everything else on the staff row, stays internal.
    expect(JSON.stringify(server)).not.toContain("Okonkwo");
    expect(Object.keys(server!).sort()).toEqual(
      ["displayName", "photoUrl", "staffId", "welcomeMessage"].sort(),
    );
  });

  test("falls back to the first name when displayName is unset", async () => {
    state.assigned = { ...SARAH, displayName: null };
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({ tableId: "t_1", venueName: "Luna" });
    // A venue that never filled in displayName still doesn't leak a surname.
    expect(server!.displayName).toBe("Sarah");
  });

  test("trims a full name typed into displayName", async () => {
    state.assigned = { ...SARAH, displayName: "Sarah Okonkwo" };
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({ tableId: "t_1", venueName: "Luna" });
    expect(server!.displayName).toBe("Sarah");
  });

  test("never introduces a suspended or departed server", async () => {
    const { serverForTable } = await import("../server-identity");
    await serverForTable({ tableId: "t_1", venueName: "Luna" });
    expect(state.lastWhere).toMatchObject({ staff: { status: "ACTIVE" } });
  });

  test("no assignment is a supported state, not an error", async () => {
    // Plenty of venues never assign tables.
    const { serverForTable } = await import("../server-identity");
    expect(await serverForTable({ tableId: "t_1", venueName: "Luna" })).toBeNull();
  });
});

describe("welcome message priority", () => {
  test("1. the server's own words win", async () => {
    state.assigned = { ...SARAH, welcomeMessage: "Hey! Grab a menu, I'm two tables away." };
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({
      tableId: "t_1",
      venueName: "Luna",
      venueWelcomeMessage: "Venue default",
    });
    expect(server!.welcomeMessage).toBe("Hey! Grab a menu, I'm two tables away.");
  });

  test("2. then the venue default — the owner controls the wording", async () => {
    state.assigned = SARAH;
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({
      tableId: "t_1",
      venueName: "Luna",
      venueWelcomeMessage: "Welcome to Luna. Make yourself at home.",
    });
    expect(server!.welcomeMessage).toBe("Welcome to Luna. Make yourself at home.");
  });

  test("3. then TabCall's, so a venue that sets nothing still reads warmly", async () => {
    state.assigned = SARAH;
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({ tableId: "t_1", venueName: "Luna" });
    expect(server!.welcomeMessage).toContain("Sarah");
    expect(server!.welcomeMessage).toContain("Luna");
  });

  test("the default works for any venue and any server, not one example", async () => {
    const { defaultWelcome } = await import("../server-identity");
    const msg = defaultWelcome("Amara", "The Local Dev Taproom");
    expect(msg).toContain("Amara");
    expect(msg).toContain("The Local Dev Taproom");
    expect(msg).not.toContain("Sarah");
    expect(msg).not.toContain("Luna");
  });

  test("whitespace-only overrides fall through instead of blanking the greeting", async () => {
    state.assigned = { ...SARAH, welcomeMessage: "   " };
    const { serverForTable } = await import("../server-identity");
    const server = await serverForTable({
      tableId: "t_1",
      venueName: "Luna",
      venueWelcomeMessage: "   ",
    });
    expect(server!.welcomeMessage).toContain("Sarah");
  });
});

describe("service call-to-action wording", () => {
  test("names the server when there is one", async () => {
    const { serviceCtaLabel, serviceSheetTitle } = await import("../server-identity");
    expect(serviceCtaLabel({ displayName: "Sarah" })).toBe("Need Sarah?");
    expect(serviceSheetTitle({ displayName: "Sarah" })).toBe("How can Sarah help?");
  });

  test("degrades to generic wording with no assignment", async () => {
    const { serviceCtaLabel, serviceSheetTitle } = await import("../server-identity");
    expect(serviceCtaLabel(null)).toBe("Need a server?");
    expect(serviceSheetTitle(null)).toBe("How can we help?");
  });
});
