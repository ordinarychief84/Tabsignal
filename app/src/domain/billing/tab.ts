import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LineItem as LineItemSchema, parseLineItems, totalsFor, type LineItem } from "@/lib/bill";
import { mirrorTabToBill } from "@/domain/billing/mirror";

/**
 * domain/billing/tab — the ONE place that reads or mutates a guest
 * session's running tab.
 *
 * Phase 1 of the restructure plan (behavior-preserving): today a tab is
 * `GuestSession.lineItems` JSON, parsed independently by ~16 files.
 * Every route/page/lib now funnels through this module, so the Phase 2
 * cutover to the canonical Order/Bill model changes exactly one file's
 * internals instead of sixteen call sites.
 *
 * Deliberately NOT here (their own modules, later PRs): PaymentIntent
 * creation (payment.ts), splits (splits.ts), webhook mutations. Routes
 * keep their auth + HTTP-shape logic; this module owns tab data only.
 */

export const DEFAULT_TIP_PERCENT = 20; // PRD v2.0 — phone-tipping anchor research

/** Parse a session's lineItems JSON. Sole legitimate parse entry point. */
export function tabItems(lineItemsJson: unknown): LineItem[] {
  return parseLineItems(lineItemsJson);
}

/** Standard bill math for a tab (subtotal, tax by venue zip, tip, total). */
export function tabTotals(items: LineItem[], venueZip: string, tipPercent: number) {
  return totalsFor(items, venueZip, tipPercent);
}

/* ------------------------------ guest bill ------------------------------ */

export type GuestBill = {
  sessionId: string;
  venueName: string;
  tableLabel: string;
  items: LineItem[];
  defaultTipPercent: number;
  totals: ReturnType<typeof totalsFor>;
};

export type GuestBillResult =
  | { ok: true; bill: GuestBill }
  | { ok: false; error: "SESSION_NOT_FOUND" | "ALREADY_PAID" };

/**
 * The guest-facing bill (venue name + table + ledger + default-tip
 * totals). Token verification stays in the route (it owns HTTP-auth
 * semantics); pass the session row it already validated.
 */
export function guestBillFor(session: {
  id: string;
  lineItems: unknown;
  venue: { name: string; zipCode: string | null };
  table: { label: string };
}): GuestBill {
  const items = tabItems(session.lineItems);
  return {
    sessionId: session.id,
    venueName: session.venue.name,
    tableLabel: session.table.label,
    items,
    defaultTipPercent: DEFAULT_TIP_PERCENT,
    totals: tabTotals(items, session.venue.zipCode ?? "", DEFAULT_TIP_PERCENT),
  };
}

/* ------------------------------ mutations ------------------------------- */

export type AddItemsResult =
  | { ok: true; sessionId: string; items: LineItem[] }
  | { ok: false; error: "SESSION_NOT_FOUND" | "FORBIDDEN" | "ALREADY_PAID" | "SESSION_EXPIRED" };

/**
 * Staff adds/replaces items on an open tab. Venue scoping enforced here
 * (staff may only touch their own venue's sessions); item VALIDATION
 * (nonnegative prices etc.) stays in the route's Zod schema — it owns
 * the wire format.
 */
export async function addItems(
  sessionId: string,
  staffVenueId: string,
  items: LineItem[],
  mode: "append" | "replace",
): Promise<AddItemsResult> {
  const session = await db.guestSession.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false, error: "SESSION_NOT_FOUND" };
  if (session.venueId !== staffVenueId) return { ok: false, error: "FORBIDDEN" };
  if (session.paidAt) return { ok: false, error: "ALREADY_PAID" };
  if (session.expiresAt.getTime() <= Date.now()) return { ok: false, error: "SESSION_EXPIRED" };

  const existing = tabItems(session.lineItems);
  const next = mode === "replace" ? items : [...existing, ...items];

  const updated = await db.guestSession.update({
    where: { id: session.id },
    data: { lineItems: next as unknown as Prisma.InputJsonValue },
  });

  // Phase 2 dual-write (no-op while BILLING_V2=off; never throws).
  await mirrorTabToBill(db, session.id);

  return { ok: true, sessionId: updated.id, items: tabItems(updated.lineItems) };
}

/** Any client exposing guestSession.update — db or a $transaction tx. */
type TabWriteClient = Pick<Prisma.TransactionClient, "guestSession">;

/**
 * Low-level ledger append for trusted internal callers (comp, loyalty
 * redemption). Two deliberate semantics, both ported verbatim:
 *
 *  - The EXISTING array is trusted as-is (raw append, no schema
 *    round-trip): the loyalty path relies on extra marker fields like
 *    isLoyaltyDiscount surviving on previously-appended items, which a
 *    LineItem parse would strip. (Known wart, preserved for Phase 1:
 *    the staff addItems path DOES parse and therefore strips markers —
 *    credits become first-class rows in Phase 2, which retires this
 *    whole class of bug.)
 *  - `extraData` merges into the same UPDATE so callers inside a
 *    transaction keep their single-write atomicity (redeem also sets
 *    guestProfileId).
 */
export async function appendTabLine(
  client: TabWriteClient,
  session: { id: string; lineItems: unknown },
  item: LineItem & Record<string, unknown>,
  // Unchecked variant: callers set scalar FKs (guestProfileId) directly.
  extraData: Prisma.GuestSessionUncheckedUpdateInput = {},
): Promise<void> {
  const existing = Array.isArray(session.lineItems) ? session.lineItems : [];
  await client.guestSession.update({
    where: { id: session.id },
    data: {
      ...extraData,
      lineItems: [...existing, item] as unknown as Prisma.InputJsonValue,
    },
  });

  // Phase 2 dual-write. Uses the SAME client so a caller inside a
  // transaction keeps the mirror atomic with its append; no-op while
  // BILLING_V2=off and never throws either way.
  await mirrorTabToBill(client as Prisma.TransactionClient, session.id);
}

/**
 * Append a manager comp as a negative line item. The caller has already
 * verified the comp token, session/venue match, unpaid state, and
 * single-use jti — this owns only the ledger mutation. Parses the
 * existing ledger first (comp-route semantics — strips junk).
 */
export async function appendComp(
  session: { id: string; lineItems: unknown },
  amountCents: number,
): Promise<LineItem> {
  const compItem = LineItemSchema.parse({
    name: "Comp · manager apology",
    quantity: 1,
    unitCents: -Math.abs(amountCents),
  });
  await appendTabLine(db, { id: session.id, lineItems: tabItems(session.lineItems) }, compItem);
  return compItem;
}

/**
 * Total spend for a session's tab in cents. Byte-for-byte port of the
 * regulars rollup: raw sum, no nonnegative floor (a comp-heavy tab can
 * legitimately net negative in the rollups today — preserve that until
 * the Phase 2 model makes credits first-class).
 */
export function spendForSession(lineItemsJson: unknown): number {
  const items = tabItems(lineItemsJson);
  return items.reduce((s, it) => s + (it.quantity ?? 1) * (it.unitCents ?? 0), 0);
}
