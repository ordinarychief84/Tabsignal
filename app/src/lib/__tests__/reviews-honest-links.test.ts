/**
 * Reviews suite R2 — honest review links + employee/shift attribution.
 *
 * THE compliance pin: /api/session/[id]/feedback returns the SAME
 * Google review URL for every rating. Google's review policy prohibits
 * gating (selectively soliciting positive reviews / withholding the
 * link from unhappy guests) — the old flow only returned reviewUrl for
 * 4–5★. If someone reintroduces the gate, the 1★ test here goes red.
 *
 * Also pins: attribution stamped on BOTH branches (last acknowledging
 * staff + venue-timezone shift bucket), and the shift bucketing math.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
});

type FeedbackRow = Record<string, unknown>;

type StubState = {
  placeId: string | null;
  existingFeedback: boolean;
  lastAcked: { acknowledgedBy: { id: string; name: string } } | null;
  created: FeedbackRow[];
  emailsSent: number;
};

let state: StubState;

beforeEach(() => {
  state = {
    placeId: "PLACE_123",
    existingFeedback: false,
    lastAcked: { acknowledgedBy: { id: "stf_maya", name: "Maya" } },
    created: [],
    emailsSent: 0,
  };

  mock.module("@/lib/db", () => ({
    db: {
      guestSession: {
        findUnique: async () => ({
          id: "gs_1",
          venueId: "v_a",
          sessionToken: "tok_guest",
          paidAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          venue: {
            id: "v_a",
            name: "Velvet Hour",
            googlePlaceId: state.placeId,
            timezone: "America/Chicago",
          },
          table: { label: "T7" },
        }),
      },
      feedbackReport: {
        findFirst: async () => (state.existingFeedback ? { id: "fb_prev" } : null),
        create: async ({ data }: { data: FeedbackRow }) => {
          state.created.push(data);
          return { id: "fb_new", ...data };
        },
      },
      request: {
        findFirst: async () => state.lastAcked,
      },
    },
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () => ({ ok: true }),
    rateLimit: () => ({ ok: true }),
  }));

  mock.module("@/lib/ai/classify-feedback", () => ({
    classifyFeedback: async () => ({
      category: "service_speed",
      confidence: "high",
      suggestion: "Apologize and comp a round.",
      serverName: "maya",
    }),
  }));

  mock.module("@/lib/email/send", () => ({
    sendEmail: async () => {
      state.emailsSent += 1;
      return { id: "email_1" };
    },
  }));

  mock.module("@/lib/email/recipients", () => ({
    venueAlertRecipients: async () => ["owner@velvet.test"],
  }));
});

function feedbackReq(body: unknown): Request {
  return new Request("https://tab-call.test/api/session/gs_1/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CTX = { params: { id: "gs_1" } };
const EXPECTED_URL = "https://search.google.com/local/writereview?placeid=PLACE_123";

describe("honest review links — the same URL for every rating", () => {
  test("5 stars gets the Google link", async () => {
    const { POST } = await import("../../app/api/session/[id]/feedback/route");
    const res = await POST(feedbackReq({ rating: 5, sessionToken: "tok_guest" }), CTX);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reviewUrl: string }).reviewUrl).toBe(EXPECTED_URL);
  });

  test("1 star gets THE SAME Google link (no gating — Google policy)", async () => {
    const { POST } = await import("../../app/api/session/[id]/feedback/route");
    const res = await POST(
      feedbackReq({ rating: 1, note: "waited forever", sessionToken: "tok_guest" }),
      CTX,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reviewUrl: string }).reviewUrl).toBe(EXPECTED_URL);
    // The intercept still runs as ADDITIONAL support, not a filter.
    expect(state.emailsSent).toBe(1);
    expect(state.created[0]!.aiCategory).toBe("service_speed");
  });

  test("no googlePlaceId → reviewUrl null on both branches", async () => {
    state.placeId = null;
    const { POST } = await import("../../app/api/session/[id]/feedback/route");
    const hi = await POST(feedbackReq({ rating: 5, sessionToken: "tok_guest" }), CTX);
    expect(((await hi.json()) as { reviewUrl: null }).reviewUrl).toBeNull();

    state.existingFeedback = false;
    state.created = [];
    const lo = await POST(feedbackReq({ rating: 2, sessionToken: "tok_guest" }), CTX);
    expect(((await lo.json()) as { reviewUrl: null }).reviewUrl).toBeNull();
  });

  test("wrong session token still refused (403)", async () => {
    const { POST } = await import("../../app/api/session/[id]/feedback/route");
    const res = await POST(feedbackReq({ rating: 5, sessionToken: "wrong" }), CTX);
    expect(res.status).toBe(403);
  });
});

describe("employee + shift attribution", () => {
  test("both branches stamp servedBy from the last acknowledging staff", async () => {
    const { POST } = await import("../../app/api/session/[id]/feedback/route");
    await POST(feedbackReq({ rating: 5, sessionToken: "tok_guest" }), CTX);
    expect(state.created[0]!.servedByStaffId).toBe("stf_maya");
    expect(state.created[0]!.servedByName).toBe("Maya");
    expect(typeof state.created[0]!.shiftBucket).toBe("string");

    state.existingFeedback = false;
    await POST(feedbackReq({ rating: 2, sessionToken: "tok_guest" }), CTX);
    expect(state.created[1]!.servedByStaffId).toBe("stf_maya");
    expect(state.created[1]!.shiftBucket).toBe(state.created[0]!.shiftBucket);
  });

  test("no acknowledged requests → null attribution, shift still bucketed", async () => {
    state.lastAcked = null;
    const { POST } = await import("../../app/api/session/[id]/feedback/route");
    await POST(feedbackReq({ rating: 4, sessionToken: "tok_guest" }), CTX);
    expect(state.created[0]!.servedByStaffId).toBeNull();
    expect(state.created[0]!.servedByName).toBeNull();
    expect(["morning", "afternoon", "evening", "late"]).toContain(
      state.created[0]!.shiftBucket as string,
    );
  });
});

describe("shiftBucketFor", () => {
  test("buckets venue-local hours at the documented boundaries", async () => {
    const { shiftBucketFor } = await import("../../domain/reviews/attribution");
    // UTC keeps the assertions deterministic.
    expect(shiftBucketFor(new Date("2026-07-08T05:00:00Z"), "UTC")).toBe("morning");
    expect(shiftBucketFor(new Date("2026-07-08T10:59:00Z"), "UTC")).toBe("morning");
    expect(shiftBucketFor(new Date("2026-07-08T11:00:00Z"), "UTC")).toBe("afternoon");
    expect(shiftBucketFor(new Date("2026-07-08T16:59:00Z"), "UTC")).toBe("afternoon");
    expect(shiftBucketFor(new Date("2026-07-08T17:00:00Z"), "UTC")).toBe("evening");
    expect(shiftBucketFor(new Date("2026-07-08T22:59:00Z"), "UTC")).toBe("evening");
    expect(shiftBucketFor(new Date("2026-07-08T23:00:00Z"), "UTC")).toBe("late");
    expect(shiftBucketFor(new Date("2026-07-08T04:59:00Z"), "UTC")).toBe("late");
  });

  test("respects the venue timezone (18:00 UTC = 13:00 Chicago in July)", async () => {
    const { shiftBucketFor } = await import("../../domain/reviews/attribution");
    expect(shiftBucketFor(new Date("2026-07-08T18:00:00Z"), "America/Chicago")).toBe("afternoon");
    expect(shiftBucketFor(new Date("2026-07-08T18:00:00Z"), "UTC")).toBe("evening");
  });

  test("invalid timezone falls back to UTC instead of throwing", async () => {
    const { shiftBucketFor } = await import("../../domain/reviews/attribution");
    expect(shiftBucketFor(new Date("2026-07-08T12:00:00Z"), "Not/AZone")).toBe("afternoon");
  });
});
