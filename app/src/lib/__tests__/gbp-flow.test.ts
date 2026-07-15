/**
 * Reviews suite R3 — Google Business Profile connect + sync.
 *
 * Ships dormant: without GOOGLE_CLIENT_ID/SECRET the connect route
 * answers 503 and the cron no-ops. With creds (test values here), the
 * flow is: signed state JWT (kind:"gbp") → callback exchanges the code
 * and stores the refresh token AES-GCM-ENCRYPTED (real crypto in these
 * tests, round-tripped through sync's decrypt) → location bind →
 * idempotent review sync keyed on gbpReviewName with FIVE→5 star
 * mapping. Google's network surface is a fetch stub throughout.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const PREV = {
  secret: process.env.NEXTAUTH_SECRET,
  gid: process.env.GOOGLE_CLIENT_ID,
  gsec: process.env.GOOGLE_CLIENT_SECRET,
  cron: process.env.BENCHMARK_CRON_SECRET,
};
beforeAll(() => {
  const env = process.env as Record<string, string>;
  env.NEXTAUTH_SECRET = "test-secret-must-be-at-least-32-characters-long-for-zod";
  env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  env.BENCHMARK_CRON_SECRET = "cron-secret";
});
afterAll(() => {
  const env = process.env as Record<string, string>;
  for (const [k, v] of [
    ["NEXTAUTH_SECRET", PREV.secret],
    ["GOOGLE_CLIENT_ID", PREV.gid],
    ["GOOGLE_CLIENT_SECRET", PREV.gsec],
    ["BENCHMARK_CRON_SECRET", PREV.cron],
  ] as const) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

type ConnRow = {
  venueId: string;
  status: string;
  encryptedRefreshToken: string | null;
  gbpAccountName: string | null;
  gbpLocationName: string | null;
  googleEmail: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
};

type StubState = {
  session: { kind: "session"; staffId: string; venueId: string; email: string; role: string } | null;
  conns: Map<string, ConnRow>;
  reviews: Map<string, Record<string, unknown>>; // by gbpReviewName
  fetchCalls: { url: string; body: string | null }[];
  googleReviewsPage: unknown[];
};

let state: StubState;
const REAL_FETCH = globalThis.fetch;

beforeEach(() => {
  state = {
    session: { kind: "session", staffId: "stf_owner", venueId: "v_a", email: "o@a.com", role: "OWNER" },
    conns: new Map(),
    reviews: new Map(),
    fetchCalls: [],
    googleReviewsPage: [
      {
        name: "accounts/1/locations/2/reviews/r1",
        starRating: "FIVE",
        comment: "Perfect margaritas",
        createTime: "2026-07-01T20:00:00Z",
        reviewer: { displayName: "Ana" },
      },
      {
        name: "accounts/1/locations/2/reviews/r2",
        starRating: "TWO",
        comment: "slow on a friday",
        createTime: "2026-07-02T21:00:00Z",
        reviewer: { displayName: "Bo" },
        reviewReply: { comment: "We hear you — come back Sunday.", updateTime: "2026-07-03T10:00:00Z" },
      },
    ],
  };

  // lib/pos/crypto (the refresh-token encryption) imports @/lib/env,
  // whose strict parse demands the full server env at import time —
  // absent in bare bun-test. Passthrough mock keeps every field any
  // consumer reads while satisfying crypto's NEXTAUTH_SECRET.
  mock.module("@/lib/env", () => ({
    env: { ...process.env, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET },
  }));

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    state.fetchCalls.push({ url, body: init?.body ? String(init.body) : null });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const params = new URLSearchParams(String(init?.body ?? ""));
      if (params.get("grant_type") === "authorization_code") {
        return Response.json({
          access_token: "at_1",
          refresh_token: "rt_secret_1",
          id_token: `x.${Buffer.from(JSON.stringify({ email: "owner@gmail.test" })).toString("base64url")}.y`,
        });
      }
      return Response.json({ access_token: "at_refreshed" });
    }
    if (url.includes("mybusiness.googleapis.com/v4/") && url.includes("/reviews")) {
      return Response.json({ reviews: state.googleReviewsPage });
    }
    if (url.includes("mybusinessaccountmanagement")) {
      return Response.json({ accounts: [{ name: "accounts/1" }] });
    }
    if (url.includes("mybusinessbusinessinformation")) {
      return Response.json({ locations: [{ name: "locations/2", title: "Velvet Hour ATX" }] });
    }
    return new Response("not stubbed: " + url, { status: 500 });
  }) as typeof fetch;

  mock.module("@/lib/auth/session", () => ({
    getStaffSession: async () => state.session,
    SESSION_COOKIE: "tabsignal_session",
    sessionCookieOptions: () => ({
      httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 2_592_000,
    }),
  }));

  mock.module("@/lib/plan-gate", () => ({
    gateAdminRoute: async (_slug: string) =>
      state.session
        ? { ok: true, venueId: state.session.venueId, plan: "free", role: state.session.role }
        : { ok: false, status: 401, body: { error: "UNAUTHORIZED" } },
    gateAdminVenuePlan: async () => ({ ok: true, venueId: "v_a", plan: "free", role: "OWNER" }),
    gateGuestVenuePlan: async () => ({ ok: true, venueId: "v_a", plan: "free" }),
    venuePlanForVenueId: async () => "free",
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () => ({ ok: true }),
    rateLimit: () => ({ ok: true }),
  }));

  mock.module("@/lib/db", () => ({
    db: {
      gbpConnection: {
        findUnique: async ({ where }: { where: { venueId: string } }) =>
          state.conns.get(where.venueId) ?? null,
        upsert: async ({ where, create, update }: {
          where: { venueId: string };
          create: Partial<ConnRow>;
          update: Partial<ConnRow>;
        }) => {
          const existing = state.conns.get(where.venueId);
          const row: ConnRow = existing
            ? { ...existing, ...update }
            : {
                venueId: where.venueId,
                status: "PENDING",
                encryptedRefreshToken: null,
                gbpAccountName: null,
                gbpLocationName: null,
                googleEmail: null,
                lastSyncAt: null,
                lastError: null,
                ...create,
              };
          state.conns.set(where.venueId, row);
          return row;
        },
        update: async ({ where, data }: { where: { venueId: string }; data: Partial<ConnRow> }) => {
          const row = state.conns.get(where.venueId);
          if (!row) throw new Error("not found");
          Object.assign(row, data);
          return row;
        },
        updateMany: async ({ data }: { where: unknown; data: Partial<ConnRow> }) => {
          for (const row of state.conns.values()) Object.assign(row, data);
          return { count: state.conns.size };
        },
        findMany: async () =>
          [...state.conns.values()]
            .filter(c => (c.status === "CONNECTED" || c.status === "ERROR") && c.encryptedRefreshToken)
            .map(c => ({ venueId: c.venueId })),
      },
      googleReview: {
        upsert: async ({ where, create, update }: {
          where: { gbpReviewName: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const existing = state.reviews.get(where.gbpReviewName);
          const row = existing ? { ...existing, ...update } : { id: `gr_${state.reviews.size + 1}`, ...create };
          state.reviews.set(where.gbpReviewName, row);
          return row;
        },
        count: async () => state.reviews.size,
      },
      venue: {
        findUnique: async () => ({ id: "v_a" }),
      },
    },
  }));
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

function req(url: string, init?: RequestInit): Request {
  return new Request(`https://tab-call.test${url}`, {
    headers: { host: "tab-call.test", "x-forwarded-proto": "https", "sec-fetch-site": "same-origin", "content-type": "application/json" },
    ...init,
  });
}

describe("connect route", () => {
  test("503 GBP_NOT_CONFIGURED when Google creds are absent (ships dormant)", async () => {
    const env = process.env as Record<string, string>;
    const saved = env.GOOGLE_CLIENT_ID;
    delete env.GOOGLE_CLIENT_ID;
    const { POST } = await import("../../app/api/admin/v/[slug]/gbp/connect/route");
    const res = await POST(req("/api/admin/v/velvet/gbp/connect", { method: "POST" }), { params: { slug: "velvet" } });
    expect(res.status).toBe(503);
    env.GOOGLE_CLIENT_ID = saved;
  });

  test("returns the Google consent URL with offline access + business.manage scope", async () => {
    const { POST } = await import("../../app/api/admin/v/[slug]/gbp/connect/route");
    const res = await POST(req("/api/admin/v/velvet/gbp/connect", { method: "POST" }), { params: { slug: "velvet" } });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const u = new URL(url);
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toContain("business.manage");
    expect(u.searchParams.get("state")).toBeTruthy();
  });
});

describe("callback", () => {
  async function stateToken() {
    const { signGbpState } = await import("../../domain/reviews/gbp");
    return signGbpState({ venueId: "v_a", slug: "velvet", staffId: "stf_owner" });
  }

  test("stores the refresh token ENCRYPTED and redirects to settings", async () => {
    const token = await stateToken();
    const { GET } = await import("../../app/api/gbp/callback/route");
    const res = await GET(req(`/api/gbp/callback?state=${encodeURIComponent(token)}&code=authcode1`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://tab-call.test/admin/v/velvet/settings?gbp=connected");

    const conn = state.conns.get("v_a")!;
    expect(conn.googleEmail).toBe("owner@gmail.test");
    expect(conn.status).toBe("PENDING");
    // Never plaintext at rest; decryptable by the real crypto lib.
    expect(conn.encryptedRefreshToken).not.toContain("rt_secret_1");
    expect(conn.encryptedRefreshToken!.startsWith("v1:")).toBe(true);
    const { decryptCredentials } = await import("../../lib/pos/crypto");
    expect(decryptCredentials(conn.encryptedRefreshToken!)).toBe("rt_secret_1");
  });

  test("a DIFFERENT signed-in staff can't complete someone else's callback", async () => {
    const token = await stateToken();
    state.session = { kind: "session", staffId: "stf_other", venueId: "v_a", email: "x@a.com", role: "OWNER" };
    const { GET } = await import("../../app/api/gbp/callback/route");
    const res = await GET(req(`/api/gbp/callback?state=${encodeURIComponent(token)}&code=authcode1`));
    expect(res.headers.get("location")).toContain("gbp_error=session_mismatch");
    expect(state.conns.size).toBe(0);
  });

  test("garbage state is rejected without touching the DB", async () => {
    const { GET } = await import("../../app/api/gbp/callback/route");
    const res = await GET(req(`/api/gbp/callback?state=nonsense&code=x`));
    expect(res.headers.get("location")).toContain("gbp_error=state");
    expect(state.conns.size).toBe(0);
  });
});

describe("sync", () => {
  async function connectedVenue() {
    const { encryptRefreshToken } = await import("../../domain/reviews/gbp");
    state.conns.set("v_a", {
      venueId: "v_a",
      status: "CONNECTED",
      encryptedRefreshToken: encryptRefreshToken("rt_secret_1"),
      gbpAccountName: "accounts/1",
      gbpLocationName: "locations/2",
      googleEmail: "owner@gmail.test",
      lastSyncAt: null,
      lastError: null,
    });
  }

  test("mirrors reviews idempotently with star mapping + pre-existing GBP replies", async () => {
    await connectedVenue();
    const { syncVenueReviews } = await import("../../domain/reviews/gbp");

    const first = await syncVenueReviews("v_a");
    expect(first).toEqual({ synced: 2 });
    const r1 = state.reviews.get("accounts/1/locations/2/reviews/r1")!;
    expect(r1.starRating).toBe(5);
    const r2 = state.reviews.get("accounts/1/locations/2/reviews/r2")!;
    expect(r2.starRating).toBe(2);
    expect(r2.replySource).toBe("gbp");

    // Re-run: same rows, not duplicates.
    const again = await syncVenueReviews("v_a");
    expect(again).toEqual({ synced: 2 });
    expect(state.reviews.size).toBe(2);
    expect(state.conns.get("v_a")!.lastSyncAt).not.toBeNull();
  });

  test("API failure lands on lastError/status ERROR instead of throwing", async () => {
    await connectedVenue();
    state.googleReviewsPage = [];
    const failingFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/reviews")) return new Response("quota", { status: 429 });
      return failingFetch(input, init);
    }) as typeof fetch;

    const { syncVenueReviews } = await import("../../domain/reviews/gbp");
    const result = await syncVenueReviews("v_a");
    expect("error" in result).toBe(true);
    expect(state.conns.get("v_a")!.status).toBe("ERROR");
    expect(state.conns.get("v_a")!.lastError).toContain("429");
  });

  test("unbound location refuses cleanly", async () => {
    const { encryptRefreshToken, syncVenueReviews } = await import("../../domain/reviews/gbp");
    state.conns.set("v_a", {
      venueId: "v_a",
      status: "PENDING",
      encryptedRefreshToken: encryptRefreshToken("rt_secret_1"),
      gbpAccountName: null,
      gbpLocationName: null,
      googleEmail: null,
      lastSyncAt: null,
      lastError: null,
    });
    expect(await syncVenueReviews("v_a")).toEqual({ error: "NO_LOCATION_BOUND" });
  });
});

describe("cron", () => {
  test("rejects bad bearer; syncs connected venues with the right one", async () => {
    const { GET } = await import("../../app/api/cron/reviews-sync/route");

    const bad = await GET(req("/api/cron/reviews-sync", { headers: { authorization: "Bearer wrong" } }));
    expect(bad.status).toBe(401);

    const { encryptRefreshToken } = await import("../../domain/reviews/gbp");
    state.conns.set("v_a", {
      venueId: "v_a",
      status: "CONNECTED",
      encryptedRefreshToken: encryptRefreshToken("rt_secret_1"),
      gbpAccountName: "accounts/1",
      gbpLocationName: "locations/2",
      googleEmail: null,
      lastSyncAt: null,
      lastError: null,
    });
    const ok = await GET(req("/api/cron/reviews-sync", { headers: { authorization: "Bearer cron-secret" } }));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { venues: number; synced: number };
    expect(body.venues).toBe(1);
    expect(body.synced).toBe(1);
  });
});
