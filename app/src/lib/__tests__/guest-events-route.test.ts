/**
 * POST /api/v/[slug]/events.
 *
 * Two properties matter here, and they pull in opposite directions.
 *
 * IT MUST NEVER BE VISIBLE TO A GUEST. Every path answers 204, including
 * the failures. A dropped analytics batch costs a venue a rounding error
 * in a chart; an error surfacing while somebody is trying to call their
 * server costs them the guest. So "returns 204" on a rejected payload is
 * the assertion, not a weakness in the test.
 *
 * IT MUST STILL REFUSE TO WRITE. Answering 204 to everything would be
 * trivially satisfiable by a route that stores whatever it is sent, so
 * every test below also checks whether a row was actually created. That
 * pairing — quiet outside, strict inside — is the whole design.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type Created = { data: Record<string, unknown>[] };

const state: {
  session: {
    id: string;
    venueId: string;
    sessionToken: string;
    expiresAt: Date;
    venue: { slug: string };
  } | null;
  ourItems: string[];
  ourPromos: string[];
  writes: Created[];
  rateLimitOk: boolean;
} = {
  session: null,
  ourItems: [],
  ourPromos: [],
  writes: [],
  rateLimitOk: true,
};

const TOKEN = "c".repeat(48);

beforeEach(() => {
  state.session = {
    id: "gs_1",
    venueId: "v1",
    sessionToken: TOKEN,
    expiresAt: new Date(Date.now() + 3_600_000),
    venue: { slug: "luna" },
  };
  state.ourItems = ["m_ours"];
  state.ourPromos = ["p_ours"];
  state.writes = [];
  state.rateLimitOk = true;

  mock.module("@/lib/db", () => ({
    db: {
      guestSession: { findUnique: async () => state.session },
      menuItem: {
        findMany: async (args: { where: { id: { in: string[] } } }) =>
          args.where.id.in.filter(id => state.ourItems.includes(id)).map(id => ({ id })),
      },
      promotion: {
        findMany: async (args: { where: { id: { in: string[] } } }) =>
          args.where.id.in.filter(id => state.ourPromos.includes(id)).map(id => ({ id })),
      },
      guestEvent: {
        createMany: async (args: Created) => {
          state.writes.push(args);
          return { count: args.data.length };
        },
      },
    },
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () => ({ ok: state.rateLimitOk, retryAfterMs: 1000 }),
    rateLimit: () => ({ ok: state.rateLimitOk, retryAfterMs: 1000 }),
  }));
});

afterEach(() => {
  mock.restore();
});

const ctx = { params: { slug: "luna" } };

function post(body: unknown) {
  return new Request("https://tab-call.test/api/v/luna/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const good = (events: unknown[]) => ({
  sessionId: "gs_1",
  sessionToken: TOKEN,
  events,
});

/** Every row the route decided to write, flattened. */
function rows() {
  return state.writes.flatMap(w => w.data);
}

describe("POST /api/v/[slug]/events", () => {
  test("stores a valid batch", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    const res = await POST(post(good([{ type: "menu_explored" }, { type: "pick_saved" }])), ctx);
    expect(res.status).toBe(204);
    expect(rows().length).toBe(2);
    expect(rows()[0]!.venueId).toBe("v1");
    expect(rows()[0]!.sessionId).toBe("gs_1");
  });

  test("a wrong token writes nothing, and says nothing", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    const res = await POST(
      post({ sessionId: "gs_1", sessionToken: "d".repeat(48), events: [{ type: "pick_saved" }] }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(rows()).toEqual([]);
  });

  test("a token of the wrong length is rejected, not crashed on", async () => {
    // timingSafeEqual throws on mismatched lengths.
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    const res = await POST(
      post({ sessionId: "gs_1", sessionToken: "short", events: [{ type: "pick_saved" }] }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(rows()).toEqual([]);
  });

  test("a session from another venue writes nothing", async () => {
    state.session!.venue.slug = "somewhere-else";
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(post(good([{ type: "pick_saved" }])), ctx);
    expect(rows()).toEqual([]);
  });

  test("an expired session writes nothing", async () => {
    state.session!.expiresAt = new Date(Date.now() - 1000);
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(post(good([{ type: "pick_saved" }])), ctx);
    expect(rows()).toEqual([]);
  });

  test("a rate-limited session writes nothing", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    const res = await POST(post(good([{ type: "pick_saved" }])), ctx);
    expect(res.status).toBe(204);
    expect(rows()).toEqual([]);
  });

  test("keeps a menu id that belongs to this venue", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(post(good([{ type: "menu_item_viewed", menuItemId: "m_ours" }])), ctx);
    expect(rows()[0]!.menuItemId).toBe("m_ours");
  });

  test("nulls a menu id from another venue rather than storing it", async () => {
    // A tampered payload could otherwise write rows referencing someone
    // else's dishes and quietly pollute their numbers. The event still
    // counts — it just stops claiming to be about a dish we can't vouch
    // for.
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(post(good([{ type: "menu_item_viewed", menuItemId: "m_theirs" }])), ctx);
    expect(rows().length).toBe(1);
    expect(rows()[0]!.menuItemId).toBeNull();
  });

  test("nulls a promotion id from another venue", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(post(good([{ type: "special_revealed", promotionId: "p_theirs" }])), ctx);
    expect(rows()[0]!.promotionId).toBeNull();
  });

  test("one bad id doesn't cost the rest of the batch", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(
      post(
        good([
          { type: "menu_item_viewed", menuItemId: "m_theirs" },
          { type: "menu_item_viewed", menuItemId: "m_ours" },
        ]),
      ),
      ctx,
    );
    expect(rows().length).toBe(2);
    expect(rows().map(r => r.menuItemId)).toEqual([null, "m_ours"]);
  });

  test("no PII from the payload survives into a row", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(
      post(
        good([
          {
            type: "phone_provided",
            phone: "+447700900000",
            name: "Alex Doe",
            ip: "203.0.113.4",
          },
        ]),
      ),
      ctx,
    );
    const serialized = JSON.stringify(rows());
    for (const leak of ["447700900000", "Alex", "203.0.113"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(Object.keys(rows()[0]!).sort()).toEqual(
      ["menuItemId", "promotionId", "sessionId", "type", "venueId"].sort(),
    );
  });

  test("an empty or unrecognised batch writes nothing", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    await POST(post(good([])), ctx);
    await POST(post(good([{ type: "not_a_real_event" }])), ctx);
    expect(state.writes).toEqual([]);
  });

  test("malformed JSON is swallowed", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    const res = await POST(
      new Request("https://tab-call.test/api/v/luna/events", {
        method: "POST",
        body: "{not json",
      }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(state.writes).toEqual([]);
  });

  test("a missing session id is not an error a guest can see", async () => {
    const { POST } = await import("../../app/api/v/[slug]/events/route");
    const res = await POST(post({ events: [{ type: "pick_saved" }] }), ctx);
    expect(res.status).toBe(204);
    expect(state.writes).toEqual([]);
  });
});
