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
