/**
 * Integration-style tests for POST /api/auth/start (magic-link request).
 *
 * Covers the email-enumeration defence: every non-success branch
 * (unknown email, rate-limited, email-send-failure-in-prod) must return
 * the same 200 shape as the success branch. Tests run the real route
 * handler with mocked db / email / rate-limit / origin so the wiring is
 * exercised end-to-end.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
const PREV_NODE_ENV = process.env.NODE_ENV;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
  if (PREV_NODE_ENV === undefined) delete (process.env as Record<string, string>).NODE_ENV;
  else (process.env as Record<string, string>).NODE_ENV = PREV_NODE_ENV;
});

type StubState = {
  knownEmail: string | null;
  emailSends: Array<{ to: string; link: string; venueName: string; staffName: string }>;
  emailShouldFail: boolean;
  rateLimitOk: boolean;
};

let state: StubState;

beforeEach(() => {
  state = {
    knownEmail: null,
    emailSends: [],
    emailShouldFail: false,
    rateLimitOk: true,
  };

  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async ({ where }: { where: { email: string } }) => {
          if (state.knownEmail && where.email === state.knownEmail) {
            return {
              id: "stf_known",
              email: state.knownEmail,
              name: "Known Staff",
              venue: { name: "Test Venue" },
            };
          }
          return null;
        },
      },
    },
  }));

  mock.module("@/lib/auth/email", () => ({
    sendMagicLinkEmail: async (args: { to: string; link: string; venueName: string; staffName: string }) => {
      if (state.emailShouldFail) {
        const err = new Error("Resend API down") as Error & { statusCode?: number };
        err.statusCode = 503;
        throw err;
      }
      state.emailSends.push(args);
    },
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () =>
      state.rateLimitOk ? { ok: true } : { ok: false, retryAfterMs: 3_600_000 },
  }));

  mock.module("@/lib/origin", () => ({
    appOrigin: () => "https://tab-call.test",
  }));
});

function makeReq(body: unknown): Request {
  return new Request("https://tab-call.test/api/auth/start", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "5.6.7.8" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/start", () => {
  test("rejects malformed body with 400 INVALID_BODY", async () => {
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_BODY");
  });

  test("known email sends magic link and returns 200 { ok: true }", async () => {
    state.knownEmail = "known@example.com";
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "known@example.com" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].to).toBe("known@example.com");
    expect(state.emailSends[0].link).toContain(
      "https://tab-call.test/api/auth/callback?token=",
    );
  });

  test("unknown email returns same 200 { ok: true } shape (no enumeration)", async () => {
    state.knownEmail = null;
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "unknown@example.com" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // Critically: no email was sent for the unknown address.
    expect(state.emailSends.length).toBe(0);
  });

  test("rate limit silently 200s (no enumeration via 429 leak)", async () => {
    state.knownEmail = "rate@example.com";
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "rate@example.com" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // No send happened: limiter blocked it.
    expect(state.emailSends.length).toBe(0);
  });

  test("normalizes email to lowercase before lookup", async () => {
    state.knownEmail = "case@example.com";
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "CASE@Example.COM" }));
    expect(res.status).toBe(200);
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].to).toBe("case@example.com");
  });

  test("passes parsed.next through to the magic-link token claim", async () => {
    state.knownEmail = "next@example.com";
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(
      makeReq({ email: "next@example.com", next: "/admin/v/foo/onboarding" }),
    );
    expect(res.status).toBe(200);
    const link = state.emailSends[0].link;
    expect(link).toContain("/api/auth/callback?token=");
    // The next= claim is encoded inside the JWT; we don't decode here,
    // but the link itself shouldn't carry next as a raw query param
    // (that path is reserved for the recipient clicking from email).
    expect(link).not.toContain("next=");
  });

  test("dev-mode email failure surfaces devLink in the response", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    state.knownEmail = "fail@example.com";
    state.emailShouldFail = true;
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "fail@example.com" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; devLink?: string };
    expect(body.ok).toBe(true);
    expect(body.devLink).toContain("/api/auth/callback?token=");
  });

  test("prod-mode email failure still returns 200 with no devLink", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    state.knownEmail = "fail@example.com";
    state.emailShouldFail = true;
    const { POST } = await import("../../app/api/auth/start/route");
    const res = await POST(makeReq({ email: "fail@example.com" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; devLink?: string };
    expect(body.ok).toBe(true);
    expect(body.devLink).toBeUndefined();
  });
});
