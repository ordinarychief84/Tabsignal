/**
 * GET /api/v/[slug]/requests/active — the route that makes a refresh
 * survivable mid-wait.
 *
 * The bug it exists to prevent: the request id lived in React state, so a
 * guest who locked their phone and reopened it lost every sign that they
 * had asked for anything. The card vanished, and the only way back was to
 * press the button again — which puts a second row in front of the same
 * server for the same table.
 *
 * Pinned here: that it re-derives from the database, that RESOLVED is
 * excluded (a finished request restored on load reads as a bug), that it
 * returns the NEWEST open one, and that the authorisation is real —
 * session token compared in constant time, venue checked, and one
 * indistinguishable 404 for every kind of miss so the endpoint can't be
 * used to enumerate session ids or find out which venue one belongs to.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Session = {
  sessionToken: string;
  expiresAt: Date;
  paidAt: Date | null;
  venue: { slug: string };
} | null;

type Req = {
  id: string;
  type: string;
  status: string;
  note: string | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
};

const state: {
  session: Session;
  requests: Req[];
  lastRequestWhere: Record<string, unknown> | null;
} = { session: null, requests: [], lastRequestWhere: null };

const TOKEN = "a".repeat(48);

function resetState() {
  state.session = {
    sessionToken: TOKEN,
    expiresAt: new Date(Date.now() + 3_600_000),
    paidAt: null,
    venue: { slug: "luna" },
  };
  state.requests = [];
  state.lastRequestWhere = null;
}

beforeEach(() => {
  resetState();
  mock.module("@/lib/db", () => ({
    db: {
      guestSession: {
        findUnique: async () => state.session,
      },
      request: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          state.lastRequestWhere = args.where;
          const allowed = (args.where.status as { in: string[] } | undefined)?.in ?? [];
          const open = state.requests.filter(r => allowed.includes(r.status));
          // Mirror the route's orderBy: newest first.
          return (
            [...open].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
          );
        },
      },
    },
  }));
});

afterEach(() => {
  mock.restore();
});

const url = (opts: { session?: string; token?: string } = {}) => {
  const params = new URLSearchParams();
  if (opts.session !== undefined) params.set("session", opts.session);
  if (opts.token !== undefined) params.set("s", opts.token);
  return `https://tab-call.test/api/v/luna/requests/active?${params}`;
};

const ctx = { params: { slug: "luna" } };

function req(id: string, status: string, ageMs: number): Req {
  return {
    id,
    type: "REFILL",
    status,
    note: null,
    createdAt: new Date(Date.now() - ageMs),
    acknowledgedAt: null,
  };
}

describe("GET /api/v/[slug]/requests/active", () => {
  test("returns the guest's open request", async () => {
    state.requests = [req("r1", "PENDING", 1000)];
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { request: { id: string; status: string } | null };
    expect(body.request?.id).toBe("r1");
    expect(body.request?.status).toBe("PENDING");
  });

  test("ACKNOWLEDGED and ESCALATED are still open", async () => {
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    for (const status of ["ACKNOWLEDGED", "ESCALATED"]) {
      state.requests = [req("r1", status, 1000)];
      const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
      const body = (await res.json()) as { request: { status: string } | null };
      expect(body.request?.status).toBe(status);
    }
  });

  test("RESOLVED is excluded — a finished request is not restored on load", async () => {
    state.requests = [req("r1", "RESOLVED", 1000)];
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { request: unknown }).request).toBeNull();
    // And the exclusion is done in the query, not by filtering after.
    expect(state.lastRequestWhere?.status).toEqual({
      in: ["PENDING", "ACKNOWLEDGED", "ESCALATED"],
    });
  });

  test("returns the newest when several are open", async () => {
    state.requests = [req("old", "PENDING", 60_000), req("new", "PENDING", 1_000)];
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(((await res.json()) as { request: { id: string } }).request.id).toBe("new");
  });

  test("scopes the query to this session only", async () => {
    state.requests = [req("r1", "PENDING", 1000)];
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(state.lastRequestWhere?.sessionId).toBe("gs_1");
  });

  test("a wrong token is a 404, not a 403", async () => {
    // Same shape as "no such session", so the endpoint can't confirm that
    // a session id exists.
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: "b".repeat(48) })), ctx);
    expect(res.status).toBe(404);
  });

  test("a token of a different length is rejected, not crashed on", async () => {
    // timingSafeEqual throws on unequal buffer lengths; the guard has to
    // come first or an attacker gets a 500 that confirms the session.
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: "short" })), ctx);
    expect(res.status).toBe(404);
  });

  test("a session belonging to another venue is a 404", async () => {
    state.session = {
      sessionToken: TOKEN,
      expiresAt: new Date(Date.now() + 3_600_000),
      paidAt: null,
      venue: { slug: "somewhere-else" },
    };
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(res.status).toBe(404);
  });

  test("an unknown session is a 404", async () => {
    state.session = null;
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "nope", token: TOKEN })), ctx);
    expect(res.status).toBe(404);
  });

  test("401s without a token", async () => {
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    expect((await GET(new Request(url({ session: "gs_1" })), ctx)).status).toBe(401);
  });

  test("401s without a session id", async () => {
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    expect((await GET(new Request(url({ token: TOKEN })), ctx)).status).toBe(401);
  });

  test("an expired session quietly has no request rather than erroring", async () => {
    // The guest page polls this. A dead tab should stop showing a card,
    // not start showing an error.
    state.session = {
      sessionToken: TOKEN,
      expiresAt: new Date(Date.now() - 1000),
      paidAt: null,
      venue: { slug: "luna" },
    };
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { request: unknown }).request).toBeNull();
  });

  test("a closed-out tab has no request", async () => {
    state.session = {
      sessionToken: TOKEN,
      expiresAt: new Date(Date.now() + 3_600_000),
      paidAt: new Date(),
      venue: { slug: "luna" },
    };
    state.requests = [req("r1", "PENDING", 1000)];
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    expect(((await res.json()) as { request: unknown }).request).toBeNull();
  });

  test("leaks nothing beyond the guest's own request", async () => {
    state.requests = [req("r1", "ACKNOWLEDGED", 1000)];
    const { GET } = await import("../../app/api/v/[slug]/requests/active/route");
    const res = await GET(new Request(url({ session: "gs_1", token: TOKEN })), ctx);
    const body = (await res.json()) as { request: Record<string, unknown> };
    // No staff name, no staff id, no venue id, no session token.
    expect(Object.keys(body.request).sort()).toEqual(
      ["acknowledgedAt", "createdAt", "id", "note", "status", "type"].sort(),
    );
  });
});
