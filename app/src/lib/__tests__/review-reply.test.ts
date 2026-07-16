/**
 * Reviews suite R4 — AI-assisted review replies.
 *
 * The model call needs a live key; what's pinned here is the
 * SECURITY-CRITICAL sanitizer (sanitizeReply) between model output and
 * a PUBLIC Google post, plus the routes' dormancy + the "manager's text
 * is authoritative, never the AI draft" contract.
 *
 * IMPORTANT (mock-leak hygiene): bun's mock.module is process-wide and
 * persists across files. This test deliberately does NOT mock
 * @/lib/csrf (uses the real originGuard with same-origin requests) nor
 * @/domain/reviews/gbp (gbp-flow.test.ts exercises the REAL module) —
 * mocking either would leak a skinny stub into those siblings on Linux
 * file-load order. The reply route drives real gbp via env + a global
 * fetch stub + real AES-GCM crypto, the same leak-free harness gbp-flow
 * uses.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const PREV = {
  secret: process.env.NEXTAUTH_SECRET,
  anthropic: process.env.ANTHROPIC_API_KEY,
  gid: process.env.GOOGLE_CLIENT_ID,
  gsec: process.env.GOOGLE_CLIENT_SECRET,
};
beforeAll(() => {
  const env = process.env as Record<string, string>;
  env.NEXTAUTH_SECRET = "test-secret-must-be-at-least-32-characters-long-for-zod";
  env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  env.GOOGLE_CLIENT_SECRET = "test-client-secret";
});
afterAll(() => {
  const env = process.env as Record<string, string>;
  for (const [k, v] of [
    ["NEXTAUTH_SECRET", PREV.secret],
    ["ANTHROPIC_API_KEY", PREV.anthropic],
    ["GOOGLE_CLIENT_ID", PREV.gid],
    ["GOOGLE_CLIENT_SECRET", PREV.gsec],
  ] as const) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

describe("sanitizeReply — the gate before a public Google post", () => {
  test("strips URLs, emails, and phone numbers (no PII leak into a public reply)", async () => {
    const { sanitizeReply } = await import("../ai/draft-review-reply");
    const dirty =
      "Thanks! Call us at (512) 555-0199 or email owner@bar.com, details at https://bar.com/x";
    const clean = sanitizeReply(dirty, "The Bar");
    expect(clean).not.toContain("512");
    expect(clean).not.toContain("@bar.com");
    expect(clean).not.toContain("http");
    expect(clean).toContain("Thanks!");
  });

  test("unwraps model quote/fence wrappers", async () => {
    const { sanitizeReply } = await import("../ai/draft-review-reply");
    expect(sanitizeReply('```\n"Come back soon!"\n```', "The Bar")).toBe("Come back soon!");
  });

  test("length-caps very long output", async () => {
    const { sanitizeReply } = await import("../ai/draft-review-reply");
    const out = sanitizeReply("word ".repeat(400), "The Bar");
    expect(out.length).toBeLessThanOrEqual(900);
  });

  test("empty/whitespace model output falls back to a safe universal reply", async () => {
    const { sanitizeReply } = await import("../ai/draft-review-reply");
    const out = sanitizeReply("   \n  ", "Velvet Hour");
    expect(out).toContain("Velvet Hour");
    expect(out.length).toBeGreaterThan(0);
  });

  test("aiRepliesEnabled tracks ANTHROPIC_API_KEY presence", async () => {
    const { aiRepliesEnabled } = await import("../ai/draft-review-reply");
    delete (process.env as Record<string, string>).ANTHROPIC_API_KEY;
    expect(aiRepliesEnabled()).toBe(false);
    (process.env as Record<string, string>).ANTHROPIC_API_KEY = "sk-ant-test";
    expect(aiRepliesEnabled()).toBe(true);
  });
});

/* ------------------------------- routes -------------------------------- */

type ReviewRow = {
  id: string;
  venueId: string;
  gbpReviewName: string;
  starRating: number;
  comment: string | null;
  reviewerName: string | null;
  replyText: string | null;
  repliedAt: Date | null;
  replySource: string | null;
  aiDraft: string | null;
  seenByMgr: boolean;
};

type State = {
  reviews: Map<string, ReviewRow>;
  encRefresh: string | null;
  gbpReplyCalls: { url: string; comment: string }[];
};
let state: State;
const REAL_FETCH = globalThis.fetch;

beforeEach(async () => {
  // Real AES-GCM refresh token so the route's gbpAccessToken decrypts it
  // for real (no crypto mock → no leak to gbp-flow).
  const { encryptRefreshToken } = await import("../../domain/reviews/gbp");

  state = {
    reviews: new Map([
      ["gr_1", {
        id: "gr_1", venueId: "v_a", gbpReviewName: "accounts/1/locations/2/reviews/r1",
        starRating: 2, comment: "slow service", reviewerName: "Bo",
        replyText: null, repliedAt: null, replySource: null, aiDraft: null, seenByMgr: false,
      }],
    ]),
    encRefresh: encryptRefreshToken("rt_secret_1"),
    gbpReplyCalls: [],
  };

  // Stub only Google's network surface (restored in afterEach).
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "at_1" });
    }
    if (url.includes("/reviews/") && url.endsWith("/reply")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      state.gbpReplyCalls.push({ url, comment: body.comment });
      return Response.json({});
    }
    return new Response("not stubbed: " + url, { status: 500 });
  }) as typeof fetch;

  // @/lib/env passthrough: crypto (via gbp) imports it and the strict
  // real parse throws in bare bun-test. Same passthrough gbp-flow uses.
  mock.module("@/lib/env", () => ({ env: { ...process.env } }));

  // Universal mocks (every route test re-installs these in beforeEach).
  mock.module("@/lib/plan-gate", () => ({
    gateAdminRoute: async () => ({ ok: true, venueId: "v_a", plan: "free", role: "OWNER" }),
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
      googleReview: {
        findUnique: async ({ where }: { where: { id: string } }) => state.reviews.get(where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Partial<ReviewRow> }) => {
          const r = state.reviews.get(where.id)!;
          Object.assign(r, data);
          return r;
        },
      },
      gbpConnection: {
        findUnique: async () => ({ encryptedRefreshToken: state.encRefresh, status: "CONNECTED" }),
      },
      venue: { findUnique: async () => ({ name: "Velvet Hour" }) },
    },
  }));
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

// Real originGuard passes same-origin (no csrf mock → no leak).
function req(body?: unknown): Request {
  return new Request("https://tab-call.test/x", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("reply route", () => {
  test("posts the MANAGER'S text to GBP (not any AI draft) and records it", async () => {
    state.reviews.get("gr_1")!.aiDraft = "AI-suggested draft the manager edited away";
    const { POST } = await import("../../app/api/admin/v/[slug]/google-reviews/[id]/reply/route");
    const res = await POST(
      req({ text: "Sorry about the wait, Bo — come back and it's on us to prove better." }),
      { params: { slug: "velvet", id: "gr_1" } },
    );
    expect(res.status).toBe(200);
    // Exactly the manager's words reached Google — not the AI draft.
    expect(state.gbpReplyCalls).toHaveLength(1);
    expect(state.gbpReplyCalls[0]!.comment).toContain("come back and it's on us");
    const r = state.reviews.get("gr_1")!;
    expect(r.replySource).toBe("tabcall");
    expect(r.repliedAt).not.toBeNull();
    expect(r.aiDraft).toBeNull(); // consumed
  });

  test("503 when GBP not configured (dormant)", async () => {
    const saved = process.env.GOOGLE_CLIENT_ID;
    delete (process.env as Record<string, string>).GOOGLE_CLIENT_ID;
    const { POST } = await import("../../app/api/admin/v/[slug]/google-reviews/[id]/reply/route");
    const res = await POST(req({ text: "hi" }), { params: { slug: "velvet", id: "gr_1" } });
    expect(res.status).toBe(503);
    (process.env as Record<string, string>).GOOGLE_CLIENT_ID = saved!;
  });

  test("empty reply text is rejected", async () => {
    const { POST } = await import("../../app/api/admin/v/[slug]/google-reviews/[id]/reply/route");
    const res = await POST(req({ text: "   " }), { params: { slug: "velvet", id: "gr_1" } });
    expect(res.status).toBe(400);
  });
});

describe("draft route", () => {
  test("503 when the AI key is absent (dormant)", async () => {
    delete (process.env as Record<string, string>).ANTHROPIC_API_KEY;
    const { POST } = await import("../../app/api/admin/v/[slug]/google-reviews/[id]/draft/route");
    const res = await POST(req(), { params: { slug: "velvet", id: "gr_1" } });
    expect(res.status).toBe(503);
  });
});
