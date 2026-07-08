/**
 * Google OAuth sign-in flow (RED-first per the approved plan).
 *
 *   GET /api/auth/google/start     — gate + CSRF-state cookie + 302 to Google
 *   GET /api/auth/google/callback  — verify state, exchange code, verify id_token,
 *                                    resolve identity → session | signup handoff
 *
 * Idioms mirror auth-callback-flow.test.ts: NEXTAUTH_SECRET in beforeAll,
 * mock.module("@/lib/db") state-stub, plain-Request builders, readDest()
 * HTML-interstitial parser. The PURE OAuth module (oauth-google: enabled
 * check, authorize-URL, state/pending JWTs) runs REAL; only the network
 * seam (oauth-google-remote: exchangeCode + verifyGoogleIdToken) is
 * stubbed, so CSRF-state matching is genuinely exercised.
 *
 * These fail until the modules/routes exist — that is the point.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  signOauthState,
  OAUTH_STATE_COOKIE,
  OAUTH_PENDING_COOKIE,
} from "../auth/oauth-google";

const PREV = {
  secret: process.env.NEXTAUTH_SECRET,
  cid: process.env.GOOGLE_CLIENT_ID,
  csec: process.env.GOOGLE_CLIENT_SECRET,
  ops: process.env.OPERATOR_EMAILS,
};
beforeAll(() => {
  const e = process.env as Record<string, string>;
  e.NEXTAUTH_SECRET = "test-secret-must-be-at-least-32-characters-long-for-zod";
  e.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  e.GOOGLE_CLIENT_SECRET = "test-client-secret";
});
afterAll(() => {
  const e = process.env as Record<string, string>;
  for (const [k, v] of [
    ["NEXTAUTH_SECRET", PREV.secret], ["GOOGLE_CLIENT_ID", PREV.cid],
    ["GOOGLE_CLIENT_SECRET", PREV.csec], ["OPERATOR_EMAILS", PREV.ops],
  ] as const) {
    if (v === undefined) delete e[k]; else e[k] = v;
  }
});

type StaffStub = {
  id: string; email: string; venueId: string; role: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "DELETED";
  emailVerifiedAt: Date | null;
};

type StubState = {
  staffByEmail: Map<string, StaffStub>;
  identityBySubject: Map<string, { staffId: string }>;
  identityCreates: Array<{ provider: string; subject: string; staffId: string; email: string }>;
  staffUpdates: Array<{ id: string; data: Record<string, unknown> }>;
  // network seam
  exchangeResult: { idToken: string } | Error;
  idTokenIdentity: { sub: string; email: string; emailVerified: boolean; name: string } | null;
};
let state: StubState;

beforeEach(() => {
  state = {
    staffByEmail: new Map(),
    identityBySubject: new Map(),
    identityCreates: [],
    staffUpdates: [],
    exchangeResult: { idToken: "fake.id.token" },
    idTokenIdentity: { sub: "google-sub-1", email: "owner@example.com", emailVerified: true, name: "Sam Owner" },
  };

  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) return state.staffByEmail.get(where.email.toLowerCase()) ?? null;
          for (const s of state.staffByEmail.values()) if (s.id === where.id) return s;
          return null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          state.staffUpdates.push({ id: where.id, data });
          return { id: where.id, ...data };
        },
      },
      authIdentity: {
        findUnique: async ({ where }: { where: { provider_subject: { provider: string; subject: string } } }) => {
          const hit = state.identityBySubject.get(where.provider_subject.subject);
          return hit ? { staffId: hit.staffId } : null;
        },
        create: async ({ data }: { data: { provider: string; subject: string; staffId: string; email: string } }) => {
          state.identityCreates.push(data);
          state.identityBySubject.set(data.subject, { staffId: data.staffId });
          return { id: "ident_1", ...data };
        },
      },
    },
  }));

  mock.module("@/lib/auth/oauth-google-remote", () => ({
    exchangeCode: async () => {
      if (state.exchangeResult instanceof Error) throw state.exchangeResult;
      return state.exchangeResult;
    },
    verifyGoogleIdToken: async () => state.idTokenIdentity,
  }));

  mock.module("@/lib/auth/operator", () => ({
    isPlatformStaffAsync: async (s: { email: string }) =>
      (process.env.OPERATOR_EMAILS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean)
        .includes(s.email.toLowerCase()),
  }));
});

function startReq(query: Record<string, string> = {}): Request {
  const url = new URL("https://tab-call.test/api/auth/google/start");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    method: "GET",
    headers: { host: "tab-call.test", "x-forwarded-proto": "https" },
  });
}

async function callbackReq(
  params: Record<string, string>,
  cookie?: string,
): Promise<Request> {
  const url = new URL("https://tab-call.test/api/auth/google/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { host: "tab-call.test", "x-forwarded-proto": "https" };
  if (cookie) headers.cookie = cookie;
  return new Request(url.toString(), { method: "GET", headers });
}

async function readDest(res: Response): Promise<string | null> {
  const loc = res.headers.get("location");
  if (loc) return loc;
  if (res.status === 200) {
    const m = /window\.location\.replace\("([^"]+)"\)/.exec(await res.text());
    return m ? m[1] : null;
  }
  return null;
}

/** Build a valid state cookie + matching state param, as /start would. */
async function validState(opts: { next?: string; intent?: string } = {}) {
  const stateValue = "state-abc";
  const nonce = "nonce-xyz";
  const token = await signOauthState({
    state: stateValue, nonce, verifier: "verif-123",
    next: opts.next, intent: opts.intent ?? "login",
  });
  return { stateValue, cookie: `${OAUTH_STATE_COOKIE}=${token}` };
}

describe("GET /api/auth/google/start", () => {
  test("503 OAUTH_NOT_CONFIGURED when creds absent", async () => {
    const e = process.env as Record<string, string>;
    const savedId = e.GOOGLE_CLIENT_ID; delete e.GOOGLE_CLIENT_ID;
    try {
      const { GET } = await import("../../app/api/auth/google/start/route");
      const res = await GET(startReq());
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("OAUTH_NOT_CONFIGURED");
    } finally { e.GOOGLE_CLIENT_ID = savedId; }
  });

  test("configured → 302 to Google with scope+client_id+state, and sets state cookie", async () => {
    const { GET } = await import("../../app/api/auth/google/start/route");
    const res = await GET(startReq({ next: "/admin/v/luna/onboarding" }));
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toStartWith("https://accounts.google.com/o/oauth2/v2/auth");
    const u = new URL(loc);
    expect(u.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(u.searchParams.get("scope")).toContain("openid");
    expect(u.searchParams.get("scope")).toContain("email");
    expect(u.searchParams.get("redirect_uri")).toBe("https://tab-call.test/api/auth/google/callback");
    expect(u.searchParams.get("state")).toBeTruthy();
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${OAUTH_STATE_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });
});

describe("GET /api/auth/google/callback — CSRF + token verification", () => {
  test("state param not matching the cookie → err=oauth_state, no session", async () => {
    const { cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: "WRONG" }, cookie));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=oauth_state");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("tabsignal_session=");
  });

  test("missing state cookie → err=oauth_state", async () => {
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: "state-abc" }));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=oauth_state");
  });

  test("code exchange failure → err=oauth_failed", async () => {
    state.exchangeResult = new Error("google token endpoint 400");
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "bad", state: stateValue }, cookie));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=oauth_failed");
  });

  test("unverifiable id_token → err=oauth_failed", async () => {
    state.idTokenIdentity = null;
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=oauth_failed");
  });

  test("email_verified:false → err=oauth_unverified", async () => {
    state.idTokenIdentity = { sub: "s", email: "e@x.com", emailVerified: false, name: "E" };
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=oauth_unverified");
  });
});

describe("GET /api/auth/google/callback — identity resolution", () => {
  test("existing AuthIdentity → session minted, lands on /staff, lastSeenAt stamped", async () => {
    state.staffByEmail.set("owner@example.com", {
      id: "stf_1", email: "owner@example.com", venueId: "v_1", role: "OWNER",
      status: "ACTIVE", emailVerifiedAt: new Date(),
    });
    state.identityBySubject.set("google-sub-1", { staffId: "stf_1" });
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(res.status).toBe(200);
    expect(await readDest(res)).toBe("https://tab-call.test/staff");
    expect(res.headers.get("set-cookie") ?? "").toContain("tabsignal_session=");
    expect(state.staffUpdates.some(u => u.id === "stf_1" && u.data.lastSeenAt)).toBe(true);
  });

  test("no identity but email matches passworded staff → AUTO-LINK + session + emailVerifiedAt", async () => {
    state.staffByEmail.set("owner@example.com", {
      id: "stf_1", email: "owner@example.com", venueId: "v_1", role: "OWNER",
      status: "ACTIVE", emailVerifiedAt: null,
    });
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toContain("tabsignal_session=");
    expect(state.identityCreates).toHaveLength(1);
    expect(state.identityCreates[0]).toMatchObject({ provider: "google", subject: "google-sub-1", staffId: "stf_1" });
    expect(state.staffUpdates.some(u => u.data.emailVerifiedAt instanceof Date)).toBe(true);
  });

  test("SUSPENDED staff → err=suspended, no link, no session", async () => {
    state.staffByEmail.set("owner@example.com", {
      id: "stf_1", email: "owner@example.com", venueId: "v_1", role: "SERVER",
      status: "SUSPENDED", emailVerifiedAt: new Date(),
    });
    state.identityBySubject.set("google-sub-1", { staffId: "stf_1" });
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=suspended");
    expect(res.headers.get("set-cookie") ?? "").not.toContain("tabsignal_session=");
  });

  test("DELETED staff → err=invalid (no enumeration)", async () => {
    state.staffByEmail.set("owner@example.com", {
      id: "stf_1", email: "owner@example.com", venueId: "v_1", role: "SERVER",
      status: "DELETED", emailVerifiedAt: new Date(),
    });
    state.identityBySubject.set("google-sub-1", { staffId: "stf_1" });
    const { stateValue, cookie } = await validState();
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(await readDest(res)).toBe("https://tab-call.test/login?err=invalid");
  });

  test("unknown email → signup handoff: pending cookie + /signup?from=google", async () => {
    state.idTokenIdentity = { sub: "new-sub", email: "brand@new.com", emailVerified: true, name: "Bran New" };
    const { stateValue, cookie } = await validState({ intent: "signup" });
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://tab-call.test/signup?from=google");
    expect(res.headers.get("set-cookie") ?? "").toContain(`${OAUTH_PENDING_COOKIE}=`);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("tabsignal_session=");
  });

  test("operator email honored; hostile next sanitized to default", async () => {
    (process.env as Record<string, string>).OPERATOR_EMAILS = "ops@tab-call.com";
    state.idTokenIdentity = { sub: "op-sub", email: "ops@tab-call.com", emailVerified: true, name: "Ops" };
    state.staffByEmail.set("ops@tab-call.com", {
      id: "stf_op", email: "ops@tab-call.com", venueId: "v_1", role: "OWNER",
      status: "ACTIVE", emailVerifiedAt: new Date(),
    });
    state.identityBySubject.set("op-sub", { staffId: "stf_op" });
    const { stateValue, cookie } = await validState({ next: "//evil.com/phish" });
    const { GET } = await import("../../app/api/auth/google/callback/route");
    const res = await GET(await callbackReq({ code: "c", state: stateValue }, cookie));
    // evil next rejected → operator default
    expect(await readDest(res)).toBe("https://tab-call.test/operator");
  });
});
