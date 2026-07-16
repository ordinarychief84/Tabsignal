/**
 * Reviews suite R4 — AI-assisted review replies.
 *
 * The model call itself needs a live key; what's pinned here is the
 * SECURITY-CRITICAL sanitizer (sanitizeReply) that stands between model
 * output and a PUBLIC Google post, plus the routes' dormancy + the
 * "manager's text is authoritative, never the AI draft" contract.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const PREV = { secret: process.env.NEXTAUTH_SECRET, anthropic: process.env.ANTHROPIC_API_KEY };
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
});
afterAll(() => {
  for (const [k, v] of [["NEXTAUTH_SECRET", PREV.secret], ["ANTHROPIC_API_KEY", PREV.anthropic]] as const) {
    if (v === undefined) delete (process.env as Record<string, string>)[k];
    else (process.env as Record<string, string>)[k] = v;
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
    const long = "word ".repeat(400);
    const out = sanitizeReply(long, "The Bar");
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
  conn: { encryptedRefreshToken: string | null; status: string } | null;
  gbpReplyCalls: { reviewName: string; comment: string }[];
};
let state: State;

beforeEach(() => {
  state = {
    reviews: new Map([
      ["gr_1", {
        id: "gr_1", venueId: "v_a", gbpReviewName: "accounts/1/locations/2/reviews/r1",
        starRating: 2, comment: "slow service", reviewerName: "Bo",
        replyText: null, repliedAt: null, replySource: null, aiDraft: null, seenByMgr: false,
      }],
    ]),
    conn: { encryptedRefreshToken: "enc", status: "CONNECTED" },
    gbpReplyCalls: [],
  };

  mock.module("@/lib/plan-gate", () => ({
    gateAdminRoute: async () => ({ ok: true, venueId: "v_a", plan: "free", role: "OWNER" }),
  }));
  mock.module("@/lib/csrf", () => ({ originGuard: () => null }));
  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () => ({ ok: true }),
    rateLimit: () => ({ ok: true }),
  }));
  mock.module("@/domain/reviews/gbp", () => ({
    gbpEnabled: () => true,
    gbpAccessToken: async () => "at_1",
    putGbpReply: async (_t: string, reviewName: string, comment: string) => {
      state.gbpReplyCalls.push({ reviewName, comment });
    },
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
      gbpConnection: { findUnique: async () => state.conn },
      venue: { findUnique: async () => ({ name: "Velvet Hour" }) },
    },
  }));
});

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
    const res = await POST(req({ text: "Sorry about the wait, Bo — come back and it's on us to prove better." }), {
      params: { slug: "velvet", id: "gr_1" },
    });
    expect(res.status).toBe(200);
    // Exactly the manager's words reached Google.
    expect(state.gbpReplyCalls).toHaveLength(1);
    expect(state.gbpReplyCalls[0]!.comment).toContain("come back and it's on us");
    const r = state.reviews.get("gr_1")!;
    expect(r.replySource).toBe("tabcall");
    expect(r.repliedAt).not.toBeNull();
    expect(r.aiDraft).toBeNull(); // consumed
  });

  test("503 when GBP not configured (dormant)", async () => {
    mock.module("@/domain/reviews/gbp", () => ({
      gbpEnabled: () => false,
      gbpAccessToken: async () => "",
      putGbpReply: async () => {},
    }));
    const { POST } = await import("../../app/api/admin/v/[slug]/google-reviews/[id]/reply/route");
    const res = await POST(req({ text: "hi" }), { params: { slug: "velvet", id: "gr_1" } });
    expect(res.status).toBe(503);
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
