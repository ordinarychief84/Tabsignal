/**
 * Phase 2 dual-write mirror (domain/billing/mirror.ts):
 *
 *   - BILLING_V2 unset/off → zero V2 writes (today's default posture)
 *   - dualwrite → Bill + BillItem snapshot keyed (guestSessionId,
 *     source='beacon'); rebuild is idempotent; negative lines (comps /
 *     refunds) mirror as-is; amountPaidCents survives rebuilds
 *   - mirror failures are swallowed and logged — the JSON write path
 *     must never break while JSON is canonical
 *   - addItems + appendTabLine both trigger the mirror
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type BillRow = {
  id: string;
  venueId: string;
  tableId: string | null;
  guestSessionId: string | null;
  source: string | null;
  status: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
};

type BillItemRow = {
  id: string;
  billId: string;
  nameSnapshot: string;
  priceCents: number;
  quantity: number;
  status: string;
};

type StubState = {
  session: {
    id: string;
    venueId: string;
    tableId: string;
    lineItems: unknown;
    paidAt: Date | null;
    expiresAt: Date;
    venue: { zipCode: string | null };
  };
  bills: Map<string, BillRow>;
  billItems: Map<string, BillItemRow>;
  failBillWrites: boolean;
  seq: number;
};

let state: StubState;
const PREV_FLAG = process.env.BILLING_V2;

beforeEach(() => {
  state = {
    session: {
      id: "gs_1",
      venueId: "v_a",
      tableId: "tbl_1",
      lineItems: [{ name: "Margarita", quantity: 2, unitCents: 1200 }],
      paidAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      venue: { zipCode: "78701" },
    },
    bills: new Map(),
    billItems: new Map(),
    failBillWrites: false,
    seq: 0,
  };

  mock.module("@/lib/db", () => ({
    db: {
      guestSession: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === state.session.id ? state.session : null,
        update: async ({ data }: { where: { id: string }; data: Record<string, unknown> }) => {
          Object.assign(state.session, data);
          return state.session;
        },
      },
      bill: {
        findFirst: async ({ where }: { where: { guestSessionId: string; source: string } }) => {
          for (const b of state.bills.values()) {
            if (b.guestSessionId === where.guestSessionId && b.source === where.source) return b;
          }
          return null;
        },
        create: async ({ data }: { data: Omit<BillRow, "id"> }) => {
          if (state.failBillWrites) throw new Error("bill write refused (test)");
          const row: BillRow = { id: `bill_${++state.seq}`, ...data } as BillRow;
          state.bills.set(row.id, row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<BillRow> }) => {
          if (state.failBillWrites) throw new Error("bill write refused (test)");
          const row = state.bills.get(where.id);
          if (!row) throw new Error("not found");
          Object.assign(row, data);
          return row;
        },
      },
      billItem: {
        deleteMany: async ({ where }: { where: { billId: string } }) => {
          let count = 0;
          for (const [id, item] of state.billItems) {
            if (item.billId === where.billId) { state.billItems.delete(id); count++; }
          }
          return { count };
        },
        createMany: async ({ data }: { data: Omit<BillItemRow, "id">[] }) => {
          for (const d of data) {
            const row: BillItemRow = { id: `bi_${++state.seq}`, ...d } as BillItemRow;
            state.billItems.set(row.id, row);
          }
          return { count: data.length };
        },
      },
    },
  }));
});

afterEach(() => {
  if (PREV_FLAG === undefined) delete (process.env as Record<string, string>).BILLING_V2;
  else (process.env as Record<string, string>).BILLING_V2 = PREV_FLAG;
});

function itemsOf(billId: string) {
  return [...state.billItems.values()].filter(i => i.billId === billId);
}

describe("flag off", () => {
  test("no V2 writes when BILLING_V2 is unset", async () => {
    delete (process.env as Record<string, string>).BILLING_V2;
    const { addItems } = await import("../../domain/billing/tab");
    const res = await addItems("gs_1", "v_a", [{ name: "Fries", quantity: 1, unitCents: 950 }], "append");
    expect(res.ok).toBe(true);
    expect(state.bills.size).toBe(0);
    expect(state.billItems.size).toBe(0);
  });
});

describe("dualwrite", () => {
  beforeEach(() => {
    (process.env as Record<string, string>).BILLING_V2 = "dualwrite";
  });

  test("addItems creates the beacon Bill with snapshot items and correct totals", async () => {
    const { addItems } = await import("../../domain/billing/tab");
    const res = await addItems("gs_1", "v_a", [{ name: "Fries", quantity: 1, unitCents: 950 }], "append");
    expect(res.ok).toBe(true);

    expect(state.bills.size).toBe(1);
    const bill = [...state.bills.values()][0]!;
    expect(bill.guestSessionId).toBe("gs_1");
    expect(bill.source).toBe("beacon");
    expect(bill.status).toBe("OPEN");
    expect(bill.subtotalCents).toBe(2 * 1200 + 950);
    expect(bill.totalCents).toBe(bill.subtotalCents + bill.taxCents);
    expect(bill.amountDueCents).toBe(bill.totalCents);

    const items = itemsOf(bill.id);
    expect(items.map(i => [i.nameSnapshot, i.quantity, i.priceCents])).toEqual([
      ["Margarita", 2, 1200],
      ["Fries", 1, 950],
    ]);
  });

  test("rebuild is idempotent and mirrors negative lines; amountPaid survives", async () => {
    const { addItems, appendComp } = await import("../../domain/billing/tab");
    await addItems("gs_1", "v_a", [{ name: "Fries", quantity: 1, unitCents: 950 }], "append");
    const bill = [...state.bills.values()][0]!;
    bill.amountPaidCents = 500; // simulate a webhook-mirrored partial payment

    await appendComp(state.session, 1000);

    expect(state.bills.size).toBe(1); // same bill, rebuilt
    const rebuilt = state.bills.get(bill.id)!;
    expect(rebuilt.amountPaidCents).toBe(500);
    expect(rebuilt.amountDueCents).toBe(Math.max(0, rebuilt.totalCents - 500));

    const items = itemsOf(bill.id);
    expect(items.length).toBe(3);
    expect(items[2]!.priceCents).toBe(-1000); // comp mirrors negative
    expect(rebuilt.subtotalCents).toBe(2 * 1200 + 950 - 1000);
  });

  test("mirror failure is swallowed — the JSON mutation still succeeds", async () => {
    state.failBillWrites = true;
    const { addItems } = await import("../../domain/billing/tab");
    const res = await addItems("gs_1", "v_a", [{ name: "Fries", quantity: 1, unitCents: 950 }], "append");
    expect(res.ok).toBe(true); // revenue path unaffected
    expect(state.bills.size).toBe(0);
    // JSON side landed:
    const { tabItems } = await import("../../domain/billing/tab");
    expect(tabItems(state.session.lineItems).length).toBe(2);
  });

  test("appendTabLine (loyalty/refund path) also mirrors, via the caller's client", async () => {
    const { appendTabLine } = await import("../../domain/billing/tab");
    const { db } = await import("@/lib/db");
    await appendTabLine(db as never, state.session, {
      name: "Loyalty redemption (20 pts)",
      quantity: 1,
      unitCents: -100,
      isLoyaltyDiscount: true,
    });
    expect(state.bills.size).toBe(1);
    const bill = [...state.bills.values()][0]!;
    expect(itemsOf(bill.id).some(i => i.priceCents === -100)).toBe(true);
  });
});
