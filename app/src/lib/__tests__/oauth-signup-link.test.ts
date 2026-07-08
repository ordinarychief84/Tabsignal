/**
 * OAuth signup completion (RED-first): POST /api/signup with a valid
 * oauth-pending cookie creates the venue with the account OAuth-linked
 * from birth — password optional, email pre-verified, AuthIdentity row,
 * NO verification email (Google already proved the address). Without the
 * cookie, password stays required (existing behavior unchanged).
 *
 * Fails until the signup route honors the pending cookie.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { signOauthPending, OAUTH_PENDING_COOKIE } from "../auth/oauth-google";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

type StubState = {
  existingByEmail: Set<string>;
  staffCreates: Array<Record<string, unknown>>;
  identityCreates: Array<Record<string, unknown>>;
  emailsSent: number;
};
let state: StubState;

beforeEach(() => {
  state = { existingByEmail: new Set(), staffCreates: [], identityCreates: [], emailsSent: 0 };

  const tx = {
    organization: {
      create: async ({ include: _i }: { include?: unknown }) => ({
        id: "org_1",
        venues: [{ id: "v_1", slug: "luna-lounge", name: "Luna Lounge" }],
      }),
    },
    staffMember: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.staffCreates.push(data);
        return { id: "stf_1", ...data };
      },
    },
    orgMember: { create: async () => ({ id: "om_1" }) },
    authIdentity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.identityCreates.push(data);
        return { id: "ident_1", ...data };
      },
    },
  };

  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async ({ where }: { where: { email: string } }) =>
          state.existingByEmail.has(where.email.toLowerCase())
            ? { id: "stf_x", name: "X", venue: { slug: "x", name: "X" } }
            : null,
      },
      venue: { findUnique: async () => null },
      $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    },
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () => ({ ok: true }),
  }));
  mock.module("@/lib/auth/email", () => ({
    sendMagicLinkEmail: async () => { state.emailsSent += 1; },
  }));
});

function signupReq(body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "tab-call.test",
    "x-forwarded-proto": "https",
    "x-forwarded-for": "203.0.113.5",
  };
  if (cookie) headers.cookie = cookie;
  return new Request("https://tab-call.test/api/signup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const VENUE_DETAILS = {
  ownerName: "Sam Owner",
  restaurantName: "Luna Lounge",
  address: "100 Main St, Austin TX 78701",
  phoneNumber: "+12125551234",
  country: "US",
  email: "sam@luna.com",
  agreeTerms: true as const,
};

describe("POST /api/signup with oauth-pending cookie", () => {
  test("no password needed → 201, staff passwordHash null + emailVerifiedAt set, AuthIdentity, no email", async () => {
    const pending = await signOauthPending({ sub: "google-sub-9", email: "sam@luna.com", name: "Sam Owner" });
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(signupReq(VENUE_DETAILS, `${OAUTH_PENDING_COOKIE}=${pending}`));
    expect(res.status).toBe(201);

    expect(state.staffCreates).toHaveLength(1);
    const staff = state.staffCreates[0]!;
    expect(staff.passwordHash ?? null).toBeNull();
    expect(staff.emailVerifiedAt).toBeInstanceOf(Date);
    expect(staff.role).toBe("OWNER");

    expect(state.identityCreates).toHaveLength(1);
    expect(state.identityCreates[0]).toMatchObject({ provider: "google", subject: "google-sub-9", staffId: "stf_1" });

    // Account is already Google-verified → no magic-link verification email.
    expect(state.emailsSent).toBe(0);

    // Pending cookie cleared.
    expect(res.headers.get("set-cookie") ?? "").toContain(`${OAUTH_PENDING_COOKIE}=`);
  });

  test("pending cookie email must match body email, else falls back to password-required (400)", async () => {
    const pending = await signOauthPending({ sub: "s", email: "different@who.com", name: "X" });
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(signupReq(VENUE_DETAILS, `${OAUTH_PENDING_COOKIE}=${pending}`));
    expect(res.status).toBe(400);
    expect(state.identityCreates).toHaveLength(0);
  });
});

describe("POST /api/signup without oauth (unchanged)", () => {
  test("no password + no pending cookie → 400 INVALID_BODY", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(signupReq(VENUE_DETAILS));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_BODY");
    expect(state.staffCreates).toHaveLength(0);
  });
});
