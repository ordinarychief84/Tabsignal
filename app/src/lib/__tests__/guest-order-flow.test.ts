/**
 * POST /api/v/[slug]/orders — a guest ordering from their table.
 *
 * This route is the only way an Order gets created, and it sits on two
 * trust boundaries worth pinning:
 *
 *   1. Prices come from the database, never the request. A client that
 *      sends its own priceCents must not be able to influence the total.
 *   2. The session token proves the guest owns the tab. Everything else
 *      (expired, closed, wrong venue) has to fail closed, and ownership
 *      is checked BEFORE the rate-limit bucket so a scraped session id
 *      can't be used to burn the real guest's allowance.
 *
 * It also mirrors the order onto GuestSession.lineItems, which is what
 * the guest's bill view and the staff floor both read — if that write
 * ever silently stops, the tab quietly under-reports what was ordered.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type MenuItemRow = { id: string; name: string; priceCents: number };

type State = {
  venue: { id: string; slug: string } | null;
  session: {
    id: string;
    sessionToken: string;
    venueId: string;
    tableId: string | null;
    expiresAt: Date;
    paidAt: Date | null;
    lineItems: unknown;
  } | null;
  menuItems: MenuItemRow[];
  rateLimitOk: boolean;
  createdOrders: { data: Record<string, unknown> }[];
  sessionUpdates: { data: Record<string, unknown> }[];
};

const state: State = {
  venue: null,
  session: null,
  menuItems: [],
  rateLimitOk: true,
  createdOrders: [],
  sessionUpdates: [],
};

const SESSION_TOKEN = "a".repeat(48);

function resetState() {
  state.venue = { id: "venue_1", slug: "audit-bistro" };
  state.session = {
    id: "gs_1",
    sessionToken: SESSION_TOKEN,
    venueId: "venue_1",
    tableId: "tbl_1",
    expiresAt: new Date(Date.now() + 3_600_000),
    paidAt: null,
    lineItems: [],
  };
  state.menuItems = [
    { id: "mi_ipa", name: "House IPA", priceCents: 800 },
    { id: "mi_wings", name: "Wing Basket", priceCents: 1450 },
  ];
  state.rateLimitOk = true;
  state.createdOrders = [];
  state.sessionUpdates = [];
}

beforeEach(() => {
  resetState();

  mock.module("@/lib/db", () => ({
    db: {
      venue: { findUnique: async () => state.venue },
      guestSession: { findUnique: async () => state.session },
      menuItem: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          state.menuItems.filter(m => where.id.in.includes(m.id)),
      },
      tableAssignment: { findMany: async () => [] },
      staffMember: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          order: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              state.createdOrders.push({ data });
              const lines = (data.items as { create: MenuItemRow[] }).create as unknown as {
                nameSnapshot: string; priceCents: number; quantity: number; notes: string | null;
              }[];
              return {
                id: "order_1",
                status: data.status,
                createdAt: new Date(),
                totalCents: data.totalCents,
                items: lines.map((l, i) => ({ id: `oi_${i}`, ...l })),
                table: { label: "Table 1" },
              };
            },
          },
          guestSession: {
            update: async ({ data }: { data: Record<string, unknown> }) => {
              state.sessionUpdates.push({ data });
              return {};
            },
          },
        }),
    },
  }));

  mock.module("@/lib/rate-limit", () => ({
    rateLimitAsync: async () => ({ ok: state.rateLimitOk, retryAfterMs: 15_000 }),
    // Mirror the full export surface: rate-limit.test.ts imports the sync
    // variant, and a partial mock would break it when file order puts this
    // file first.
    rateLimit: () => ({ ok: state.rateLimitOk, retryAfterMs: 15_000 }),
  }));
  // Realtime IS mocked, and completely.
  //
  // mock.module swaps a module process-wide and bun's file order varies,
  // so sibling suites that stub `events` with only the helpers they care
  // about will otherwise leak in and leave `events.orderPlaced` undefined
  // here. Every helper is listed so this file neither breaks others nor
  // depends on which of them ran first.
  mock.module("@/lib/realtime", () => ({
    emit: async () => undefined,
    events: {
      newRequest: async () => undefined,
      requestAcknowledged: async () => undefined,
      requestResolved: async () => undefined,
      orderPlaced: async () => undefined,
      orderStatusChanged: async () => undefined,
      regularArrived: async () => undefined,
    },
  }));
  // @/lib/fcm is deliberately NOT mocked. Stubbing it made fcm.test.ts
  // assert against the stub instead of the real implementation, and it
  // needs no stub: the push path exits before sendPushToStaff because the
  // mocked staffMember.findMany returns no tokens.
});

afterEach(() => { mock.restore(); });

function post(body: unknown): Request {
  return new Request("https://tab-call.test/api/v/audit-bistro/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: { slug: "audit-bistro" } };

describe("POST /api/v/[slug]/orders", () => {
  test("creates an order and prices it from the database", async () => {
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    const res = await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_ipa", quantity: 2 }],
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { totalCents: number; itemCount: number };
    expect(body.totalCents).toBe(1600); // 2 × 800, from the DB
    expect(body.itemCount).toBe(2);
    expect(state.createdOrders.length).toBe(1);
  });

  test("a client-supplied price is ignored — the DB price wins", async () => {
    // The regression that matters: if priceCents were ever trusted from
    // the body, anyone could order a steak for a penny.
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    const res = await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_wings", quantity: 1, priceCents: 1, nameSnapshot: "Free wings" }],
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).totalCents).toBe(1450);
  });

  test("mirrors the order onto the running tab", async () => {
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_ipa", quantity: 2 }],
      }),
      ctx,
    );
    expect(state.sessionUpdates.length).toBe(1);
    expect(state.sessionUpdates[0]!.data.lineItems).toEqual([
      { name: "House IPA", quantity: 2, unitCents: 800 },
    ]);
  });

  test("appends to an existing tab rather than replacing it", async () => {
    state.session!.lineItems = [{ name: "Earlier round", quantity: 1, unitCents: 500 }];
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_ipa", quantity: 1 }],
      }),
      ctx,
    );
    expect(state.sessionUpdates[0]!.data.lineItems).toEqual([
      { name: "Earlier round", quantity: 1, unitCents: 500 },
      { name: "House IPA", quantity: 1, unitCents: 800 },
    ]);
  });

  test("refuses a wrong session token without creating anything", async () => {
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    const res = await POST(
      post({
        sessionId: "gs_1",
        sessionToken: "b".repeat(48),
        items: [{ menuItemId: "mi_ipa", quantity: 1 }],
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(state.createdOrders.length).toBe(0);
  });

  test("refuses an item from another venue's menu", async () => {
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    const res = await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_from_elsewhere", quantity: 1 }],
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_ITEMS");
    expect(state.createdOrders.length).toBe(0);
  });

  test("refuses an expired session", async () => {
    state.session!.expiresAt = new Date(Date.now() - 1000);
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    const res = await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_ipa", quantity: 1 }],
      }),
      ctx,
    );
    expect(res.status).toBe(410);
    expect(state.createdOrders.length).toBe(0);
  });

  test("429s when the rate limiter says so", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("../../app/api/v/[slug]/orders/route");
    const res = await POST(
      post({
        sessionId: "gs_1",
        sessionToken: SESSION_TOKEN,
        items: [{ menuItemId: "mi_ipa", quantity: 1 }],
      }),
      ctx,
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(state.createdOrders.length).toBe(0);
  });
});
