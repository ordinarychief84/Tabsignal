/**
 * Integration tests for POST /api/webhooks/stripe.
 *
 * Stripe is the payment plane — a double-charge or a silently dropped
 * event causes real money damage. The webhook handler's two non-obvious
 * guarantees are:
 *
 *   1. Signature verification BEFORE any state mutation (otherwise
 *      anyone with the URL can forge events and mark bills paid).
 *   2. Idempotency under Stripe's retry storm — the same event.id
 *      delivered twice runs `processEvent` exactly once. The handler
 *      uses (a) a unique constraint on WebhookEvent.id and (b) a
 *      SELECT … FOR UPDATE inside the processing transaction to
 *      serialise concurrent deliveries.
 *
 * These tests prove the wiring of (1) + (2). The downstream side
 * effects of individual event types (payment_intent.succeeded marking
 * a bill paid, account.updated flipping Stripe Connect flags, etc.)
 * are exercised in stripe-helpers.test.ts and bill.test.ts.
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
  // Bun's mock.module is process-wide. Restore our mocks so they
  // don't leak into sibling tests via Linux's readdir order.
  mock.restore();
});

type StubState = {
  /** When non-null, constructEvent returns this; null → throws. */
  verifyAs: { id: string; type: string; data: { object: Record<string, unknown> } } | null;
  /** Set true to make the `webhookEvent.create` insert hit a P2002 unique
   *  constraint, simulating Stripe's retry delivering an already-seen id. */
  duplicateInsert: boolean;
  /** processedAt that the `FOR UPDATE` select returns. Null = first time. */
  processedAt: Date | null;
  /** Set true to make processEvent throw, simulating a downstream
   *  side-effect failure (e.g. bill update raced with another write). */
  processEventThrows: boolean;
  /** Records what processEvent observed when it ran. */
  processedEventIds: string[];
  /** Records mark-processed updates. */
  markedProcessed: string[];
  /** Records error-field updates from the catch branch. */
  markedErrored: Array<{ id: string; detail: string }>;
};

let state: StubState;

function resetState() {
  state = {
    verifyAs: null,
    duplicateInsert: false,
    processedAt: null,
    processEventThrows: false,
    processedEventIds: [],
    markedProcessed: [],
    markedErrored: [],
  };
}

beforeEach(() => {
  resetState();

  // Mock the Stripe constructor so constructEvent is under our control.
  // Include EVERY export from the real module — Bun's mock.module is
  // process-wide, so a partial factory here drops `stripeErrorResponse`
  // for any sibling test file that imports it (notably
  // bill-payment-flow.test.ts via the session/payment route). The
  // dropped named export then throws SyntaxError at load time.
  mock.module("@/lib/stripe", () => ({
    stripe: () => ({
      webhooks: {
        constructEvent: (_raw: string, _sig: string, _secret: string) => {
          if (!state.verifyAs) throw new Error("Webhook signature verification failed");
          return state.verifyAs;
        },
      },
    }),
    stripeErrorResponse: (err: unknown, _prefix: string) =>
      Response.json({ error: "STRIPE_ERROR", detail: String(err) }, { status: 500 }),
  }));

  // Mock db. Only the surface this route touches.
  mock.module("@/lib/db", () => ({
    db: {
      webhookEvent: {
        create: async ({ data }: { data: { id: string } }) => {
          if (state.duplicateInsert) {
            // Prisma constructs P2002 with meta.target. The handler only
            // checks code === "P2002", so meta shape doesn't matter.
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              { code: "P2002", clientVersion: "5.22.0", meta: { target: ["id"] } },
            );
          }
          return data;
        },
        update: async ({ data, where }: { data: { processedAt?: Date; error?: string | null }; where: { id: string } }) => {
          if (data.processedAt) state.markedProcessed.push(where.id);
          if (data.error) state.markedErrored.push({ id: where.id, detail: data.error });
          return { id: where.id };
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        // Narrow tx surface — only what processEvent touches for the
        // event types our tests use (account.updated). The route's
        // queryRaw returns the FOR UPDATE row; we hand back the
        // configured processedAt so the handler decides duplicate vs
        // fresh on its own. Any model call that the test doesn't
        // exercise is a no-op stub.
        const tx = {
          $queryRaw: async () => [{ processedAt: state.processedAt }],
          webhookEvent: {
            update: async ({ where, data }: { where: { id: string }; data: { processedAt?: Date } }) => {
              if (data.processedAt) state.markedProcessed.push(where.id);
              return { id: where.id };
            },
          },
          billSplitV2: { findUnique: async () => null },
          venue: {
            findUnique: async () => null,
            update: async () => ({}),
            updateMany: async () => {
              // First touch processEvent makes for account.updated — use
              // this as the proxy for "processEvent actually ran" so the
              // duplicate test can assert the path was skipped.
              if (state.verifyAs) state.processedEventIds.push(state.verifyAs.id);
              if (state.processEventThrows) throw new Error("downstream blew up");
              return { count: 0 };
            },
          },
          organization: { findUnique: async () => null, update: async () => ({}) },
          bill: { findUnique: async () => null, update: async () => ({}) },
        };
        return fn(tx);
      },
    },
  }));

  // Deliberate omission: the route also imports @/lib/realtime,
  // @/lib/bill, @/lib/loyalty, @/lib/stripe-helpers. We do NOT mock
  // these because (a) Bun's mock.module is process-wide and
  // mock.restore() doesn't undo it (per docs), so any mock here leaks
  // into sibling test files via Linux CI's readdir order; (b) the
  // event types our tests exercise (account.updated, signature
  // failures, idempotency wiring) never enter the route branches that
  // use those helpers, so the real imports load cleanly without
  // running any side-effectful code.
});

function makeReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://tab-call.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=abcdef", ...headers },
    body,
  });
}

describe("POST /api/webhooks/stripe", () => {
  test("400 SIGNATURE_MISSING when no signature header", async () => {
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const res = await POST(
      new Request("https://tab-call.test/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("SIGNATURE_MISSING");
    expect(state.processedEventIds.length).toBe(0);
  });

  test("400 INVALID_SIGNATURE when constructEvent throws for all configured secrets", async () => {
    state.verifyAs = null; // verifier throws
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_SIGNATURE");
    expect(state.processedEventIds.length).toBe(0);
  });

  test("200 on first delivery — inserts event, runs processEvent, marks processedAt", async () => {
    state.verifyAs = {
      id: "evt_first_1",
      type: "account.updated",
      data: { object: { id: "acct_1" } },
    };
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate?: boolean };
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
    expect(state.processedEventIds).toEqual(["evt_first_1"]);
    expect(state.markedProcessed).toContain("evt_first_1");
  });

  test("200 duplicate=true on a retry of an already-processed event (P2002 + processedAt set)", async () => {
    state.verifyAs = {
      id: "evt_dup_1",
      type: "account.updated",
      data: { object: { id: "acct_2" } },
    };
    state.duplicateInsert = true;        // create() raises P2002
    state.processedAt = new Date();       // FOR UPDATE row says we're done
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean; duplicate: boolean };
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);
    // processEvent must NOT run again on duplicate.
    expect(state.processedEventIds.length).toBe(0);
  });

  test("first delivery still runs processEvent when create succeeds even if a stale processedAt is null", async () => {
    state.verifyAs = {
      id: "evt_fresh_1",
      type: "account.updated",
      data: { object: { id: "acct_3" } },
    };
    state.processedAt = null;
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(200);
    expect(state.processedEventIds).toEqual(["evt_fresh_1"]);
  });

  test("500 PROCESSING_FAILED + error field populated when processEvent throws", async () => {
    state.verifyAs = {
      id: "evt_err_1",
      type: "account.updated",
      data: { object: { id: "acct_4" } },
    };
    state.processEventThrows = true;
    const { POST } = await import("../../app/api/webhooks/stripe/route");
    const res = await POST(makeReq("{}"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("PROCESSING_FAILED");
    expect(body.detail).toContain("downstream blew up");
    expect(state.markedErrored.length).toBe(1);
    expect(state.markedErrored[0].id).toBe("evt_err_1");
  });
});
