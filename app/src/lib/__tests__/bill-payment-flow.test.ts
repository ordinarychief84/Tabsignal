/**
 * End-to-end test for the guest bill payment round-trip.
 *
 * This is the highest revenue-impact path in the product: a regression
 * here means guests can't pay (or pay and never get marked paid).
 *
 * The full prod path is:
 *   1. Guest GET  /api/session/[id]/bill         (read totals + items)
 *   2. Guest POST /api/session/[id]/payment       (create Stripe PI)
 *   3. Stripe webhook → POST /api/webhooks/stripe (mark session.paidAt)
 *
 * The non-obvious contract this test pins is the METADATA round-trip
 * between step 2 and step 3 — the payment route stamps the PI with
 * `tabcall_session_id` and the webhook reads that exact key. If either
 * side drifts, a paid charge never marks the session paid, and we owe
 * a guest a refund.
 *
 * Mocks: db + stripe at the module level. Bill/totals math runs for
 * real (lib/bill.ts is pure). No filesystem, no network, no Postgres.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Prisma } from "@prisma/client";

const PREV_SECRET = process.env.NEXTAUTH_SECRET;
const PREV_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
beforeAll(() => {
  (process.env as Record<string, string>).NEXTAUTH_SECRET =
    "test-secret-must-be-at-least-32-characters-long-for-zod";
  (process.env as Record<string, string>).STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
});
afterAll(() => {
  if (PREV_SECRET === undefined) delete (process.env as Record<string, string>).NEXTAUTH_SECRET;
  else (process.env as Record<string, string>).NEXTAUTH_SECRET = PREV_SECRET;
  if (PREV_WEBHOOK_SECRET === undefined) delete (process.env as Record<string, string>).STRIPE_WEBHOOK_SECRET;
  else (process.env as Record<string, string>).STRIPE_WEBHOOK_SECRET = PREV_WEBHOOK_SECRET;
});

type SessionRow = {
  id: string;
  venueId: string;
  tableId: string;
  sessionToken: string;
  lineItems: Array<{ name: string; unitCents: number; quantity: number }>;
  tipPercent: number | null;
  stripePaymentIntentId: string | null;
  paidAt: Date | null;
  expiresAt: Date;
  guestProfileId: string | null;
  venue: { id: string; name: string; zipCode: string; stripeAccountId: string | null; stripeChargesEnabled: boolean };
  table: { label: string };
};

type StubState = {
  session: SessionRow;
  // Side effects we observe.
  createdIntents: Array<{ amount: number; currency: string; metadata: Record<string, string>; idempotencyKey: string }>;
  guestSessionUpdates: Array<{ id: string; data: Partial<SessionRow> }>;
  emittedEvents: Array<{ kind: string; id?: string; event: string }>;
  webhookEventCreated: boolean;
  webhookProcessedAt: Date | null;
};

let state: StubState;

beforeEach(() => {
  const session: SessionRow = {
    id: "sess_test_1",
    venueId: "ven_1",
    tableId: "tbl_1",
    sessionToken: "tok_session_abc123",
    lineItems: [
      { name: "Margarita", unitCents: 1200, quantity: 2 },
      { name: "Truffle Fries", unitCents: 900, quantity: 1 },
    ],
    tipPercent: null,
    stripePaymentIntentId: null,
    paidAt: null,
    expiresAt: new Date(Date.now() + 60 * 60_000),
    guestProfileId: null,
    venue: {
      id: "ven_1",
      name: "Luna Lounge",
      zipCode: "77002",
      stripeAccountId: null, // standalone (non-Connect) for simpler test wiring
      stripeChargesEnabled: true,
    },
    table: { label: "Table 4" },
  };
  state = {
    session,
    createdIntents: [],
    guestSessionUpdates: [],
    emittedEvents: [],
    webhookEventCreated: false,
    webhookProcessedAt: null,
  };

  // Mock stripe so paymentIntents.create captures the call and the
  // webhook's signature verification accepts our synthetic event.
  mock.module("@/lib/stripe", () => ({
    stripe: () => ({
      paymentIntents: {
        create: async (
          payload: { amount: number; currency: string; metadata: Record<string, string> },
          opts: { idempotencyKey: string },
        ) => {
          state.createdIntents.push({
            amount: payload.amount,
            currency: payload.currency,
            metadata: payload.metadata,
            idempotencyKey: opts.idempotencyKey,
          });
          return {
            id: "pi_test_1",
            client_secret: "pi_test_1_secret_xyz",
            amount: payload.amount,
            currency: payload.currency,
            status: "requires_payment_method",
            metadata: payload.metadata,
          };
        },
      },
      webhooks: {
        constructEvent: (raw: string) => JSON.parse(raw),
      },
    }),
    stripeErrorResponse: (err: unknown, _prefix: string) =>
      Response.json({ error: "STRIPE_ERROR", detail: String(err) }, { status: 500 }),
  }));

  mock.module("@/lib/db", () => ({
    db: {
      guestSession: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (where.id === state.session.id) return state.session;
          return null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
          state.guestSessionUpdates.push({ id: where.id, data });
          // Apply to local state so subsequent reads see the update.
          state.session = { ...state.session, ...data };
          return state.session;
        },
      },
      webhookEvent: {
        create: async ({ data }: { data: { id: string } }) => {
          if (state.webhookEventCreated) {
            // Simulate Stripe's "delivered twice" retry hitting the unique
            // constraint. The webhook handler swallows P2002 and falls
            // through to the FOR UPDATE row check.
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              { code: "P2002", clientVersion: "5.22.0", meta: { target: ["id"] } },
            );
          }
          state.webhookEventCreated = true;
          return data;
        },
        update: async ({ data }: { data: { processedAt?: Date; error?: string | null } }) => {
          if (data.processedAt) state.webhookProcessedAt = data.processedAt;
          return { id: "evt_1" };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: async () => [{ processedAt: state.webhookProcessedAt }],
          webhookEvent: {
            update: async ({ data }: { data: { processedAt?: Date } }) => {
              if (data.processedAt) state.webhookProcessedAt = data.processedAt;
              return { id: "evt_1" };
            },
          },
          guestSession: {
            findUnique: async ({ where }: { where: { id: string } }) => {
              if (where.id !== state.session.id) return null;
              return {
                ...state.session,
                venue: { id: state.session.venue.id, name: state.session.venue.name, zipCode: state.session.venue.zipCode },
                table: { label: state.session.table.label },
              };
            },
            update: async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
              state.guestSessionUpdates.push({ id: where.id, data });
              state.session = { ...state.session, ...data };
              return state.session;
            },
          },
          billSplit: { findUnique: async () => null, update: async () => ({}), findMany: async () => [] },
          billSplitV2: { findUnique: async () => null },
          preOrder: { findUnique: async () => null },
          billItem: { updateMany: async () => ({ count: 0 }) },
          bill: { findUnique: async () => null, update: async () => ({}) },
          // Catch-all stubs for branches we don't enter.
          venue: { update: async () => ({}), updateMany: async () => ({ count: 0 }), findUnique: async () => null },
          organization: { update: async () => ({}), findUnique: async () => null },
        };
        return fn(tx);
      },
    },
  }));

  // Deliberate omission: we do NOT mock @/lib/realtime, @/lib/loyalty,
  // or @/lib/stripe-helpers. Bun's mock.module is process-wide and
  // mock.restore() doesn't undo it (per docs), so any mock here leaks
  // into sibling test files that import the same module — which
  // breaks loyalty.test.ts (imports `redeemPoints` we never stubbed)
  // and others. Our session fixture has guestProfileId=null so the
  // webhook's awardPoints branch is skipped; the realtime emit goes
  // through the real module's no-op transport in test mode; and
  // stripe-helpers's subscriptionStatusFor isn't reached on
  // payment_intent.succeeded.
});

describe("Bill → Payment → Webhook round-trip", () => {
  test("GET /api/session/[id]/bill returns totals + line items for a valid sessionToken", async () => {
    const { GET } = await import("../../app/api/session/[id]/bill/route");
    const req = new Request(
      `https://tab-call.test/api/session/${state.session.id}/bill?s=${state.session.sessionToken}`,
    );
    const res = await GET(req, { params: { id: state.session.id } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      venueName: string;
      tableLabel: string;
      items: Array<{ name: string }>;
      totals: { subtotalCents: number; totalCents: number };
    };
    expect(body.venueName).toBe("Luna Lounge");
    expect(body.tableLabel).toBe("Table 4");
    expect(body.items.length).toBe(2);
    // 2 × $12 + 1 × $9 = $33 subtotal
    expect(body.totals.subtotalCents).toBe(3300);
    expect(body.totals.totalCents).toBeGreaterThan(3300); // tip + tax stacked on
  });

  test("POST /api/session/[id]/payment creates a Stripe PaymentIntent with the right metadata + idempotency key", async () => {
    const { POST } = await import("../../app/api/session/[id]/payment/route");
    const req = new Request(`https://tab-call.test/api/session/${state.session.id}/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipPercent: 20, sessionToken: state.session.sessionToken }),
    });
    const res = await POST(req, { params: { id: state.session.id } });
    expect(res.status).toBe(200);
    expect(state.createdIntents.length).toBe(1);
    const intent = state.createdIntents[0];
    // Metadata keys the webhook needs to mark the session paid. If
    // either side renames this key without updating the other,
    // payments succeed but sessions never flip to paid — guests
    // overcharged. Pin the contract.
    expect(intent.metadata.tabcall_session_id).toBe(state.session.id);
    expect(intent.metadata.tabcall_venue_id).toBe(state.session.venueId);
    expect(intent.metadata.tabcall_table_id).toBe(state.session.tableId);
    expect(intent.metadata.tip_percent).toBe("20");
    expect(Number(intent.metadata.tip_cents)).toBeGreaterThan(0);
    // Idempotency key is keyed on (session, amount, tip) so retries
    // don't mint a fresh PI but a tip change does. Audit it shape-wise.
    expect(intent.idempotencyKey).toContain(`pi_${state.session.id}`);
    expect(intent.idempotencyKey).toMatch(/_\d+_20$/); // ends with _AMOUNT_TIP
    // Session row was updated with the intent ID so the client can
    // resume payment if it disconnects between PI create + confirm.
    const updateWithIntent = state.guestSessionUpdates.find(u => u.data.stripePaymentIntentId);
    expect(updateWithIntent).toBeDefined();
    expect(updateWithIntent!.data.stripePaymentIntentId).toBe("pi_test_1");
  });

  test("POST /api/session/[id]/payment refuses on bad sessionToken (FORBIDDEN, no PI minted)", async () => {
    const { POST } = await import("../../app/api/session/[id]/payment/route");
    const req = new Request(`https://tab-call.test/api/session/${state.session.id}/payment`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipPercent: 20, sessionToken: "wrong-token-same-length-xxxx" }),
    });
    const res = await POST(req, { params: { id: state.session.id } });
    expect(res.status).toBe(403);
    expect(state.createdIntents.length).toBe(0);
  });

  test("Webhook payment_intent.succeeded with matching session metadata marks guestSession.paidAt", async () => {
    // Synthesise the exact event Stripe would send after the
    // PaymentIntent we created above succeeds. The payload mirrors
    // what stripe().webhooks.constructEvent returns at runtime.
    const event = {
      id: "evt_test_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_test_1",
          metadata: {
            tabcall_session_id: state.session.id,
            tabcall_venue_id: state.session.venueId,
            tabcall_table_id: state.session.tableId,
            tip_percent: "20",
            tip_cents: "600",
          },
        },
      },
    };
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const req = new Request("https://tab-call.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=abcdef" },
      body: JSON.stringify(event),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
    // Session is now paid — the critical contract. Realtime emit is
    // best-effort (best tested via the staff queue test suite, not
    // here; mocking @/lib/realtime would pollute sibling tests).
    const paidUpdate = state.guestSessionUpdates.find(u => u.data.paidAt instanceof Date);
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate!.id).toBe(state.session.id);
  });

  test("Webhook with metadata.tabcall_session_id pointing at a different session does NOT mark our session paid", async () => {
    // Defense against the metadata cross-talk path: a webhook event
    // whose metadata claims a session we don't recognise should
    // simply no-op, not accidentally mark our test session paid.
    const event = {
      id: "evt_test_2",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_other",
          metadata: { tabcall_session_id: "sess_someone_else" },
        },
      },
    };
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const req = new Request("https://tab-call.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=abcdef" },
      body: JSON.stringify(event),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Our session must still be unpaid.
    const paidUpdate = state.guestSessionUpdates.find(u => u.data.paidAt instanceof Date);
    expect(paidUpdate).toBeUndefined();
  });
});
