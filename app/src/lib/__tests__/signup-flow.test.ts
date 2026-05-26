/**
 * Integration-style tests for POST /api/signup.
 *
 * Strategy: mock.module the three external deps the handler reaches into
 * (db / email sender / rate-limit) and call the real route handler. This
 * catches wiring bugs that pure-schema tests would miss — transaction
 * shape, magic-link claim contents, response status codes, slug-collision
 * suffixing, and the email-failure fallback path.
 *
 * The mocks are configured inside each test (after a beforeEach reset)
 * because we use a Bun mock-state-per-test pattern.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// HS256 needs a secret >= 32 chars.
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

/** Stub DB state — recreated before each test. */
type StubState = {
  existingStaffEmail: string | null;
  existingStaffVenueSlug: string;
  existingSlugTaken: boolean;
  createdVenueSlug: string | null;
  createdStaffEmail: string | null;
  createdStaffWithPassword: boolean;
  emailSends: Array<{ to: string; link: string; venueName: string }>;
  emailShouldFail: boolean;
  rateLimitOk: boolean;
};

let state: StubState;

function resetState() {
  state = {
    existingStaffEmail: null,
    existingStaffVenueSlug: "luna-lounge",
    existingSlugTaken: false,
    createdVenueSlug: null,
    createdStaffEmail: null,
    createdStaffWithPassword: false,
    emailSends: [],
    emailShouldFail: false,
    rateLimitOk: true,
  };
}

beforeEach(() => {
  resetState();

  // Mock @/lib/db — only the methods the signup route touches.
  mock.module("@/lib/db", () => ({
    db: {
      staffMember: {
        findUnique: async ({ where }: { where: { email: string } }) => {
          if (state.existingStaffEmail && where.email === state.existingStaffEmail) {
            return {
              id: "stf_existing",
              email: state.existingStaffEmail,
              name: "Existing Owner",
              venue: { slug: state.existingStaffVenueSlug, name: "Luna Lounge" },
            };
          }
          return null;
        },
      },
      venue: {
        findUnique: async ({ where }: { where: { slug: string } }) => {
          if (state.existingSlugTaken && where.slug === "test-venue") {
            return { id: "v_existing", slug: "test-venue" };
          }
          return null;
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          organization: {
            create: async ({ data }: { data: { name: string; venues: { create: { slug: string; name: string } } } }) => {
              state.createdVenueSlug = data.venues.create.slug;
              return {
                id: "org_new",
                venues: [
                  {
                    id: "v_new",
                    slug: data.venues.create.slug,
                    name: data.venues.create.name,
                  },
                ],
              };
            },
          },
          staffMember: {
            create: async ({
              data,
            }: {
              data: { email: string; name: string; role: string; passwordHash?: string; passwordChangedAt?: Date };
            }) => {
              state.createdStaffEmail = data.email;
              state.createdStaffWithPassword = Boolean(data.passwordHash);
              return { id: "stf_new", email: data.email, name: data.name, role: data.role };
            },
          },
          orgMember: {
            create: async ({ data }: { data: { orgId: string; email: string; role: string } }) => ({
              id: "om_new",
              ...data,
            }),
          },
        };
        return await fn(tx);
      },
    },
  }));

  // Mock email sender. Captures sends and can throw.
  mock.module("@/lib/auth/email", () => ({
    sendMagicLinkEmail: async (args: { to: string; link: string; venueName: string; staffName: string }) => {
      if (state.emailShouldFail) {
        const err = new Error("Resend API down") as Error & { statusCode?: number };
        err.statusCode = 503;
        throw err;
      }
      state.emailSends.push({ to: args.to, link: args.link, venueName: args.venueName });
    },
  }));

  // Mock rate-limit — fail-open by default; tests can force-deny by
  // setting state.rateLimitOk = false.
  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () =>
      state.rateLimitOk ? { ok: true } : { ok: false, retryAfterMs: 3_600_000 },
  }));

  // Mock origin helper so the magic link comes out predictable.
  mock.module("@/lib/origin", () => ({
    appOrigin: () => "https://tab-call.test",
  }));
});

function makeReq(body: unknown): Request {
  return new Request("https://tab-call.test/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

/**
 * Build a complete, valid signup payload. Tests pass overrides to
 * test edge cases without re-listing the six required fields each
 * time. Phone number is in E.164 (+1 for US) and address contains a
 * parseable ZIP for the tax routing.
 */
function validPayload(overrides: Partial<{
  email: string;
  password: string;
  ownerName: string;
  restaurantName: string;
  address: string;
  phoneNumber: string;
  country: string;
  agreeTerms: unknown;
}> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ownerName: "Sam Owner",
    restaurantName: "Test Venue",
    address: "123 Main St, Houston, TX 77002",
    phoneNumber: "+12125551234",
    country: "US",
    email: "owner@new.com",
    password: "StrongPassword-2026",
    agreeTerms: true,
  };
  return { ...base, ...overrides };
}

describe("POST /api/signup", () => {
  test("creates org + venue + owner and returns 201 with slug", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; slug: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe("test-venue");
    expect(state.createdVenueSlug).toBe("test-venue");
    expect(state.createdStaffEmail).toBe("owner@new.com");
    // Password is now mandatory at signup so passwordHash is always
    // written on the first staff row.
    expect(state.createdStaffWithPassword).toBe(true);
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].to).toBe("owner@new.com");
    // Verification link routes to /api/auth/callback; the click
    // sets emailVerifiedAt + mints the first session cookie.
    expect(state.emailSends[0].link).toContain(
      "https://tab-call.test/api/auth/callback?token=",
    );
  });

  test("rejects invalid body with 400 INVALID_BODY + detail", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ email: "not-an-email" })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(body.detail).toContain("email");
  });

  test("rejects when IP rate limit is exhausted", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterMs: number };
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  test("existing email re-issues a sign-in link to the venue (no new venue)", async () => {
    state.existingStaffEmail = "existing@owner.com";
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq(validPayload({
        email: "existing@owner.com",
        restaurantName: "Different Name",
      })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; alreadyRegistered: boolean };
    expect(body.alreadyRegistered).toBe(true);
    expect(state.createdVenueSlug).toBeNull();
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].link).toContain("/api/auth/callback?token=");
  });

  test("slug collision is suffixed with a 4-char random tail", async () => {
    state.existingSlugTaken = true;
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ email: "fresh@owner.com" })));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; slug: string };
    // "test-venue" was taken; result is "test-venue-XXXX" where XXXX is
    // the first 4 chars of a lowercased base64url token.
    expect(body.slug).toMatch(/^test-venue-[a-z0-9_-]{4}$/);
    expect(state.createdVenueSlug).toBe(body.slug);
  });

  test("rejects when agreeTerms is missing (server-side terms gate)", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const payload = validPayload();
    delete payload.agreeTerms;
    const res = await POST(makeReq(payload));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(body.detail).toContain("agreeTerms");
    expect(state.createdVenueSlug).toBeNull();
    expect(state.emailSends.length).toBe(0);
  });

  test("rejects when agreeTerms is literally false", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ agreeTerms: false })));
    expect(res.status).toBe(400);
    expect(state.createdVenueSlug).toBeNull();
    expect(state.emailSends.length).toBe(0);
  });

  test("rejects password shorter than 12 chars with INVALID_BODY", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ password: "short" })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(state.createdVenueSlug).toBeNull();
  });

  test("rejects non-E.164 phone numbers", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ phoneNumber: "555-1234" })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(body.detail).toMatch(/phone/i);
  });

  test("rejects non-ISO country codes", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ country: "usa" })));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(body.detail).toMatch(/country/i);
  });

  test("email send failure surfaces emailDeliveryFailed (and devLink in dev)", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    state.emailShouldFail = true;
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(makeReq(validPayload({ email: "fresh@owner.com" })));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      slug: string;
      emailDeliveryFailed?: boolean;
      devLink?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.emailDeliveryFailed).toBe(true);
    expect(body.devLink).toContain("/api/auth/callback?token=");
  });
});
