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
            create: async ({ data }: { data: { email: string; name: string; role: string } }) => {
              state.createdStaffEmail = data.email;
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

describe("POST /api/signup", () => {
  test("creates org + venue + owner and returns 201 with slug", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "owner@new.com",
        ownerName: "Sam Owner",
        venueName: "Test Venue",
        zipCode: "77002",
        agreeTerms: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; slug: string };
    expect(body.ok).toBe(true);
    expect(body.slug).toBe("test-venue");
    expect(state.createdVenueSlug).toBe("test-venue");
    expect(state.createdStaffEmail).toBe("owner@new.com");
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].to).toBe("owner@new.com");
    expect(state.emailSends[0].link).toContain(
      "https://tab-call.test/api/auth/callback?token=",
    );
  });

  test("rejects invalid body with 400 INVALID_BODY + detail", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "not-an-email",
        ownerName: "Sam",
        venueName: "Test",
        zipCode: "abc",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(body.detail).toContain("email");
  });

  test("rejects when IP rate limit is exhausted", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "owner@new.com",
        ownerName: "Sam Owner",
        venueName: "Test Venue",
        zipCode: "77002",
        agreeTerms: true,
      }),
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; retryAfterMs: number };
    expect(body.error).toBe("RATE_LIMITED");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  test("existing email re-issues a sign-in link to the venue (no new venue)", async () => {
    state.existingStaffEmail = "existing@owner.com";
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "existing@owner.com",
        ownerName: "Sam Owner",
        venueName: "Different Name",
        zipCode: "77002",
        agreeTerms: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; alreadyRegistered: boolean };
    expect(body.alreadyRegistered).toBe(true);
    // No new venue created.
    expect(state.createdVenueSlug).toBeNull();
    // Sign-in email goes out, targeted at the existing venue slug.
    expect(state.emailSends.length).toBe(1);
    expect(state.emailSends[0].link).toContain("/api/auth/callback?token=");
  });

  test("slug collision is suffixed with a 4-char random tail", async () => {
    state.existingSlugTaken = true;
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "fresh@owner.com",
        ownerName: "Fresh Owner",
        venueName: "Test Venue",
        zipCode: "77002",
        agreeTerms: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; slug: string };
    // "test-venue" was taken, so the result must be "test-venue-XXXX"
    // where XXXX is the first 4 chars of a lowercased base64url token
    // (alphabet: a-z, 0-9, underscore, dash).
    expect(body.slug).toMatch(/^test-venue-[a-z0-9_-]{4}$/);
    expect(state.createdVenueSlug).toBe(body.slug);
  });

  test("rejects when agreeTerms is missing (server-side terms gate)", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "owner@new.com",
        ownerName: "Sam Owner",
        venueName: "Test Venue",
        zipCode: "77002",
        // agreeTerms intentionally omitted — server must refuse.
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("INVALID_BODY");
    expect(body.detail).toContain("agreeTerms");
    // Nothing was committed.
    expect(state.createdVenueSlug).toBeNull();
    expect(state.emailSends.length).toBe(0);
  });

  test("rejects when agreeTerms is literally false", async () => {
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "owner@new.com",
        ownerName: "Sam Owner",
        venueName: "Test Venue",
        zipCode: "77002",
        agreeTerms: false,
      }),
    );
    expect(res.status).toBe(400);
    expect(state.createdVenueSlug).toBeNull();
    expect(state.emailSends.length).toBe(0);
  });

  test("email send failure surfaces emailDeliveryFailed (and devLink in dev)", async () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    state.emailShouldFail = true;
    const { POST } = await import("../../app/api/signup/route");
    const res = await POST(
      makeReq({
        email: "fresh@owner.com",
        ownerName: "Fresh Owner",
        venueName: "Test Venue",
        zipCode: "77002",
        agreeTerms: true,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      slug: string;
      emailDeliveryFailed?: boolean;
      devLink?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.emailDeliveryFailed).toBe(true);
    // dev mode → devLink leaked so local testing isn't blocked
    expect(body.devLink).toContain("/api/auth/callback?token=");
  });
});
