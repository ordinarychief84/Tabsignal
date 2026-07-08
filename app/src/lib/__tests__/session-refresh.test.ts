/**
 * Session sliding-renewal — the "token refresh" the user asked for
 * (RED-first). No Google refresh tokens are stored; refresh means
 * reissuing our own 30-day session cookie when it is valid, aging, and
 * not revoked. Applies identically to magic-link / password / OAuth
 * sessions (all mint the same cookie).
 *
 *   maybeRenewSession(claims, staffValidAfter, now)  — pure threshold logic
 *   POST /api/auth/session/refresh                   — the route around it
 *
 * Fails until the helper + route exist.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SignJWT } from "jose";
import { maybeRenewSession } from "../auth/session";

const DAY = 24 * 60 * 60_000;
const NOW = 1_800_000_000_000; // fixed clock (ms)
const iatSecAgo = (days: number) => Math.floor((NOW - days * DAY) / 1000);

describe("maybeRenewSession (pure)", () => {
  test("fresh session (<7d old) does not renew", () => {
    expect(maybeRenewSession({ iat: iatSecAgo(2) }, null, NOW)).toEqual({ renew: false, reason: "fresh" });
  });

  test("aging session (7d–30d) renews", () => {
    const r = maybeRenewSession({ iat: iatSecAgo(14) }, null, NOW);
    expect(r.renew).toBe(true);
    expect(r.reason).toBe("aged");
  });

  test("expired session (>30d) is rejected, not renewed", () => {
    expect(maybeRenewSession({ iat: iatSecAgo(31) }, null, NOW)).toEqual({ renew: false, reason: "expired" });
  });

  test("revoked (iat before sessionsValidAfter) is rejected even if aging", () => {
    const validAfter = new Date(NOW - 5 * DAY); // sign-out-everywhere 5 days ago
    const r = maybeRenewSession({ iat: iatSecAgo(14) }, validAfter, NOW);
    expect(r).toEqual({ renew: false, reason: "revoked" });
  });

  test("revocation takes precedence over freshness", () => {
    const validAfter = new Date(NOW - 1 * DAY);
    // session minted 2 days ago (fresh) but before a 1-day-ago revocation
    expect(maybeRenewSession({ iat: iatSecAgo(2) }, validAfter, NOW).reason).toBe("revoked");
  });
});

describe("POST /api/auth/session/refresh", () => {
  // Real originGuard + real token verify/sign (NO cross-file mock leak);
  // only @/lib/db is stubbed. Aged sessions are REAL JWTs with a
  // backdated iat, so the route's real verifySessionTokenWithIat runs.
  let sessionsValidAfter: Date | null;
  const SECRET = "test-secret-must-be-at-least-32-characters-long-for-zod";
  const PREV_SECRET = process.env.NEXTAUTH_SECRET;
  beforeAll(() => { (process.env as Record<string, string>).NEXTAUTH_SECRET = SECRET; });
  afterAll(() => {
    if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
    else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
  });

  beforeEach(() => {
    sessionsValidAfter = null;
    mock.module("@/lib/db", () => ({
      db: { staffMember: { findUnique: async () => ({ sessionsValidAfter }) } },
    }));
  });

  /** A real session JWT with a backdated iat (still within 30d exp). */
  async function agedSession(daysAgo: number): Promise<string> {
    const iat = Math.floor((Date.now() - daysAgo * DAY) / 1000);
    return new SignJWT({ kind: "session", staffId: "stf_1", venueId: "v_1", email: "owner@example.com", role: "OWNER" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(iat)
      .setExpirationTime(iat + 30 * 24 * 3600)
      .sign(new TextEncoder().encode(SECRET));
  }

  function refreshReq(cookie?: string, fetchSite = "same-origin"): Request {
    const headers: Record<string, string> = {
      host: "tab-call.test", "x-forwarded-proto": "https", "sec-fetch-site": fetchSite,
    };
    if (cookie) headers.cookie = cookie;
    return new Request("https://tab-call.test/api/auth/session/refresh", { method: "POST", headers });
  }

  test("aging-but-valid session → 200 refreshed + fresh Set-Cookie", async () => {
    const jwt = await agedSession(14);
    const { POST } = await import("../../app/api/auth/session/refresh/route");
    const res = await POST(refreshReq(`tabsignal_session=${jwt}`));
    expect(res.status).toBe(200);
    expect((await res.json()).refreshed).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tabsignal_session=");
    // A genuinely fresh cookie: not the same token we sent in.
    expect(setCookie).not.toContain(jwt);
  });

  test("fresh session → 200 not refreshed, no cookie churn", async () => {
    const { POST } = await import("../../app/api/auth/session/refresh/route");
    const res = await POST(refreshReq(`tabsignal_session=${await agedSession(1)}`));
    expect(res.status).toBe(200);
    expect((await res.json()).refreshed).toBe(false);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("tabsignal_session=");
  });

  test("no/invalid cookie → 401", async () => {
    const { POST } = await import("../../app/api/auth/session/refresh/route");
    expect((await POST(refreshReq())).status).toBe(401);
    expect((await POST(refreshReq("tabsignal_session=not.a.jwt"))).status).toBe(401);
  });

  test("revoked session (sign-out-everywhere) → 401", async () => {
    sessionsValidAfter = new Date(); // revoked just now; token iat is 14d old
    const { POST } = await import("../../app/api/auth/session/refresh/route");
    const res = await POST(refreshReq(`tabsignal_session=${await agedSession(14)}`));
    expect(res.status).toBe(401);
  });

  test("CSRF: cross-site request is blocked (403)", async () => {
    const { POST } = await import("../../app/api/auth/session/refresh/route");
    const res = await POST(refreshReq(`tabsignal_session=${await agedSession(14)}`, "cross-site"));
    expect(res.status).toBe(403);
  });
});
