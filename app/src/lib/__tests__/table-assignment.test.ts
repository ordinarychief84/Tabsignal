/**
 * Assigning tables from the Tables page.
 *
 * The relation always existed and was always editable — from the People
 * page, per person, behind an unlabelled overflow menu. An owner looking
 * at their floor asks "who has 12", and the only way to answer that was
 * to open every server in turn. So the feature was real and effectively
 * invisible, which is indistinguishable from missing.
 *
 * This is the same TableAssignment rows through a second door. The tests
 * below care about the two things that make a second door dangerous:
 * that it writes the SAME relation rather than a parallel one, and that
 * it can't be used to reach across venues.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTE_PATH = join(
  import.meta.dir,
  "../../app/api/admin/v/[slug]/tables/[id]/staff/route.ts",
);
const ROUTE = readFileSync(ROUTE_PATH, "utf8");
const PAGE = readFileSync(
  join(import.meta.dir, "../../app/admin/v/[slug]/tables/page.tsx"),
  "utf8",
);
const CONSOLE = readFileSync(
  join(import.meta.dir, "../../app/staff/console/waiter-console.tsx"),
  "utf8",
);

type Staff = { id: string; name: string; displayName: string | null };

const state: {
  venue: { id: string } | null;
  table: { id: string; label: string; venueId: string } | null;
  eligible: Staff[];
  deletes: Record<string, unknown>[];
  creates: Record<string, unknown>[][];
  emitted: unknown[];
} = {
  venue: null,
  table: null,
  eligible: [],
  deletes: [],
  creates: [],
  emitted: [],
};

const SESSION = { staffId: "owner_1", venueId: "venue_1", role: "OWNER", email: "o@x.com" };

beforeEach(() => {
  state.venue = { id: "venue_1" };
  state.table = { id: "table_1", label: "12", venueId: "venue_1" };
  state.eligible = [{ id: "staff_a", name: "Maya Okafor", displayName: "Maya" }];
  state.deletes = [];
  state.creates = [];
  state.emitted = [];

  mock.module("@/lib/db", () => ({
    db: {
      venue: { findUnique: async () => state.venue },
      table: { findUnique: async () => state.table },
      staffMember: { findMany: async () => state.eligible },
      tableAssignment: {
        deleteMany: (args: { where: Record<string, unknown> }) => {
          state.deletes.push(args.where);
          return args;
        },
        createMany: (args: { data: Record<string, unknown>[] }) => {
          state.creates.push(args.data);
          return args;
        },
      },
      $transaction: async (ops: unknown[]) => ops,
    },
  }));

  mock.module("@/lib/auth/session", () => ({
    getStaffSession: async () => SESSION,
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge: 1,
    }),
  }));
  mock.module("@/lib/audit", () => ({ audit: async () => undefined }));
  mock.module("@/lib/realtime", () => ({
    emit: async () => undefined,
    events: {
      tableAssignmentChanged: async (_v: string, p: unknown) => { state.emitted.push(p); },
      newRequest: async () => undefined,
      requestAcknowledged: async () => undefined,
      requestOnMyWay: async () => undefined,
      requestResolved: async () => undefined,
      orderPlaced: async () => undefined,
      orderStatusChanged: async () => undefined,
      regularArrived: async () => undefined,
    },
  }));
});

afterEach(() => {
  mock.restore();
});

const ctx = { params: { slug: "luna", id: "table_1" } };

function patch(body: unknown, site = "same-origin") {
  return new Request("https://tab-call.test/api/admin/v/luna/tables/table_1/staff", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "sec-fetch-site": site },
    body: JSON.stringify(body),
  });
}

describe("it writes the existing relation, not a parallel one", () => {
  test("assignments are replaced wholesale for this table", async () => {
    // Sent as a complete set rather than add/remove, so two managers
    // editing at once converge on a state somebody chose rather than on
    // a merge neither asked for.
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    const res = await PATCH(patch({ staffIds: ["staff_a"] }), ctx);
    expect(res.status).toBe(200);
    expect(state.deletes[0]).toEqual({ tableId: "table_1" });
    expect(state.creates[0]).toEqual([{ tableId: "table_1", staffMemberId: "staff_a" }]);
  });

  test("clearing everyone is allowed and writes no rows", async () => {
    // A table with nobody on it still works — requests reach the whole
    // floor. Refusing an empty set would strand a manager mid-reshuffle.
    state.eligible = [];
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    const res = await PATCH(patch({ staffIds: [] }), ctx);
    expect(res.status).toBe(200);
    expect(state.deletes[0]).toEqual({ tableId: "table_1" });
    expect(state.creates).toEqual([]);
  });

  test("delete and create happen in one transaction", async () => {
    // A half-applied reshuffle would leave a table covered by nobody
    // during service.
    expect(ROUTE).toContain("db.$transaction");
  });

  test("it touches no model other than TableAssignment", async () => {
    const body = ROUTE.split("export async function PATCH")[1] ?? "";
    expect(body).toContain("db.tableAssignment");
    for (const other of ["db.request.", "db.guestSession.", "db.wishlist."]) {
      expect(body).not.toContain(other);
    }
  });
});

describe("it cannot reach across venues", () => {
  test("a venue that isn't the caller's is refused", async () => {
    state.venue = { id: "venue_2" };
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    expect((await PATCH(patch({ staffIds: [] }), ctx)).status).toBe(403);
    expect(state.deletes).toEqual([]);
  });

  test("a table belonging to another venue is a 404", async () => {
    state.table = { id: "table_1", label: "12", venueId: "venue_2" };
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    expect((await PATCH(patch({ staffIds: [] }), ctx)).status).toBe(404);
    expect(state.deletes).toEqual([]);
  });

  test("a staff id that isn't active here is refused, not silently dropped", async () => {
    // Silently dropping would tell the manager the save worked while the
    // table stayed uncovered. And assigning someone from another venue
    // would put a room they've never seen in their queue.
    state.eligible = []; // the lookup finds none of the requested ids
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    const res = await PATCH(patch({ staffIds: ["someone_elses_staff"] }), ctx);
    expect(res.status).toBe(400);
    expect(state.deletes).toEqual([]);
  });

  test("the eligibility lookup is scoped to the venue and to ACTIVE", async () => {
    const body = ROUTE.split("export async function PATCH")[1] ?? "";
    expect(body).toContain("venueId: venue.id");
    expect(body).toContain('status: "ACTIVE"');
  });
});

describe("permissions and guards", () => {
  test("it requires the existing assign-tables permission", async () => {
    // Not a new permission — the same one the People page already used.
    expect(ROUTE).toContain('can(role, "staff.assign_tables")');
  });

  test("legacy STAFF rows are treated as owners, as everywhere else", async () => {
    expect(ROUTE).toContain('session.role === "STAFF" ? "OWNER" : session.role');
  });

  test("a cross-origin write is refused", async () => {
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    expect((await PATCH(patch({ staffIds: [] }, "cross-site"), ctx)).status).toBe(403);
    expect(state.deletes).toEqual([]);
  });

  test("the change is audited", async () => {
    expect(ROUTE).toContain('action: "table.assignments_changed"');
  });
});

describe("the floor finds out without signing out", () => {
  test("a reassignment emits to the venue", async () => {
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    await PATCH(patch({ staffIds: ["staff_a"] }), ctx);
    expect(state.emitted.length).toBe(1);
  });

  test("the waiter console actually listens for it", async () => {
    // §41. An event nobody subscribes to is the same as no event — this
    // codebase has shipped that four times.
    expect(CONSOLE).toContain("table_assignment_changed");
  });
});

describe("only floor names leave the server", () => {
  test("the response and the page both prefer displayName", async () => {
    // `name` can be a legal name, and this page is read over somebody's
    // shoulder in a back office.
    expect(ROUTE).toContain("s.displayName ?? s.name");
    expect(PAGE).toContain("displayName ?? ");
  });

  test("the response returns names, never emails", async () => {
    const { PATCH } = await import(
      "../../app/api/admin/v/[slug]/tables/[id]/staff/route"
    );
    const res = await PATCH(patch({ staffIds: ["staff_a"] }), ctx);
    const body = (await res.json()) as { staff: Record<string, unknown>[] };
    expect(Object.keys(body.staff[0]!).sort()).toEqual(["id", "name"]);
    expect(body.staff[0]!.name).toBe("Maya");
  });
});
