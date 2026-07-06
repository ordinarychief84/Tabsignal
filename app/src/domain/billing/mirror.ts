import type { Prisma } from "@prisma/client";
import { tabItems, tabTotals } from "@/domain/billing/tab";

/**
 * domain/billing/mirror — Phase 2 dual-write: mirror a session's JSON
 * tab into the canonical Bill/BillItem model.
 *
 * Design (per the approved restructure plan):
 *   - Gated by BILLING_V2 (off | dualwrite | canonical). Absent = off.
 *   - FULL REBUILD on every mutation: the mirror derives the entire
 *     Bill state from the current JSON, so it's idempotent, self-heals
 *     sessions that started before the flag flipped, and can never
 *     drift from its source.
 *   - Bill + BillItem only — no phantom Order rows. Beacon tabs have no
 *     kitchen-order concept; Bill.orderId stays null and the admin
 *     bills viewer renders them fine.
 *   - Keyed by (guestSessionId, source='beacon') — one mirrored bill
 *     per session, disjoint from native V2-surface bills (source null).
 *   - NEVER throws: while JSON is canonical, a mirror failure must not
 *     break the revenue path. Failures log loudly (grep
 *     "[billing:mirror]") and the parity check reports drift the same
 *     way — these logs ARE the dual-write soak signal that gates the
 *     canonical flip.
 *   - Tips/payment state are NOT mirrored here — the webhook mirror
 *     (PR 2.3) owns paid/refund transitions. amountPaidCents is
 *     preserved across rebuilds for that reason.
 */

export type BillingV2Mode = "off" | "dualwrite" | "canonical";

export function billingV2Mode(): BillingV2Mode {
  const raw = (process.env.BILLING_V2 ?? "").trim();
  return raw === "dualwrite" || raw === "canonical" ? raw : "off";
}

/** Client surface the mirror needs — db or a $transaction tx. */
type MirrorClient = Pick<Prisma.TransactionClient, "guestSession" | "bill" | "billItem">;

export async function mirrorTabToBill(client: MirrorClient, sessionId: string): Promise<void> {
  if (billingV2Mode() === "off") return;
  try {
    const session = await client.guestSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        venueId: true,
        tableId: true,
        lineItems: true,
        venue: { select: { zipCode: true } },
      },
    });
    if (!session) return;

    const items = tabItems(session.lineItems);
    const totals = tabTotals(items, session.venue.zipCode ?? "", 0); // tip mirrors at payment time (PR 2.3)
    const totalCents = totals.subtotalCents + totals.taxCents;

    const existing = await client.bill.findFirst({
      where: { guestSessionId: session.id, source: "beacon" },
      select: { id: true, amountPaidCents: true },
    });

    const bill = existing
      ? await client.bill.update({
          where: { id: existing.id },
          data: {
            subtotalCents: totals.subtotalCents,
            taxCents: totals.taxCents,
            totalCents,
            amountDueCents: Math.max(0, totalCents - existing.amountPaidCents),
          },
        })
      : await client.bill.create({
          data: {
            venueId: session.venueId,
            tableId: session.tableId,
            guestSessionId: session.id,
            source: "beacon",
            status: "OPEN",
            subtotalCents: totals.subtotalCents,
            taxCents: totals.taxCents,
            totalCents,
            amountDueCents: totalCents,
          },
        });

    // Snapshot rebuild: replace the item rows wholesale. BillItem allows
    // negative priceCents, so comps / loyalty discounts / refund lines
    // mirror as-is.
    await client.billItem.deleteMany({ where: { billId: bill.id } });
    if (items.length > 0) {
      await client.billItem.createMany({
        data: items.map(it => ({
          billId: bill.id,
          nameSnapshot: it.name,
          priceCents: it.unitCents,
          quantity: it.quantity,
          status: "UNPAID" as const,
        })),
      });
    }

    // Parity assertion — the dual-write soak signal. items are the same
    // array both sides derive from, so a mismatch means a bug in the
    // mirror itself (or concurrent mutation between read and write).
    const itemSum = items.reduce((s, it) => s + it.quantity * it.unitCents, 0);
    if (itemSum !== totals.subtotalCents) {
      console.error("[billing:mirror] parity mismatch", {
        sessionId: session.id,
        billId: bill.id,
        itemSum,
        subtotalCents: totals.subtotalCents,
      });
    }
  } catch (err) {
    console.error("[billing:mirror] mirror failed (JSON remains canonical)", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* --------------------- payment-state mirrors (PR 2.3) ------------------- */

// Find the session's beacon bill, creating it via a fresh rebuild when
// missing (self-healing: covers sessions whose tab predates the flag).
async function beaconBillFor(client: MirrorClient, sessionId: string) {
  let bill = await client.bill.findFirst({
    where: { guestSessionId: sessionId, source: "beacon" },
  });
  if (!bill) {
    await mirrorTabToBill(client, sessionId);
    bill = await client.bill.findFirst({
      where: { guestSessionId: sessionId, source: "beacon" },
    });
  }
  return bill;
}

/**
 * Full-session payment landed (webhook payment_intent.succeeded):
 * tip becomes known here — fold it into the bill, settle in full.
 */
export async function mirrorBillPaidInFull(
  client: MirrorClient,
  sessionId: string,
  tipCents: number,
): Promise<void> {
  if (billingV2Mode() === "off") return;
  try {
    const bill = await beaconBillFor(client, sessionId);
    if (!bill) return;
    const totalCents = bill.subtotalCents + bill.taxCents + bill.serviceCents + tipCents;
    await client.bill.update({
      where: { id: bill.id },
      data: {
        tipTotalCents: tipCents,
        totalCents,
        amountPaidCents: totalCents,
        amountDueCents: 0,
        status: "PAID",
      },
    });
  } catch (err) {
    console.error("[billing:mirror] paid-in-full mirror failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * One legacy split settled: accumulate the paid amount + tip;
 * PARTIAL until the session's last split lands (sessionFullyPaid).
 */
export async function mirrorBillSplitPayment(
  client: MirrorClient,
  sessionId: string,
  paidCents: number,
  tipCents: number,
  sessionFullyPaid: boolean,
): Promise<void> {
  if (billingV2Mode() === "off") return;
  try {
    const bill = await beaconBillFor(client, sessionId);
    if (!bill) return;
    const tipTotalCents = bill.tipTotalCents + tipCents;
    const totalCents = bill.subtotalCents + bill.taxCents + bill.serviceCents + tipTotalCents;
    const amountPaidCents = bill.amountPaidCents + paidCents;
    const amountDueCents = Math.max(0, totalCents - amountPaidCents);
    await client.bill.update({
      where: { id: bill.id },
      data: {
        tipTotalCents,
        totalCents,
        amountPaidCents,
        amountDueCents: sessionFullyPaid ? 0 : amountDueCents,
        status: sessionFullyPaid || amountDueCents <= 0 ? "PAID" : "PARTIAL",
      },
    });
  } catch (err) {
    console.error("[billing:mirror] split-payment mirror failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * charge.refunded landed for the session. The refund line itself was
 * already mirrored by the appendTabLine rebuild; this flips status —
 * REFUNDED on full refunds, PAID kept on partials (guest just got some
 * money back; paidAt semantics unchanged on the session side too).
 */
export async function mirrorBillRefund(
  client: MirrorClient,
  sessionId: string,
  fullRefund: boolean,
): Promise<void> {
  if (billingV2Mode() === "off") return;
  try {
    const bill = await beaconBillFor(client, sessionId);
    if (!bill) return;
    if (fullRefund) {
      await client.bill.update({
        where: { id: bill.id },
        data: { status: "REFUNDED" },
      });
    }
  } catch (err) {
    console.error("[billing:mirror] refund mirror failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
