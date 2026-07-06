import type Stripe from "stripe";
import type { BillSplit, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { dollars } from "@/lib/bill";
import { awardPoints, pointsForCents } from "@/lib/loyalty";
import { events } from "@/lib/realtime";
import { tabItems, tabTotals } from "@/domain/billing/tab";

/**
 * domain/billing/splits — even-N bill splits (legacy BillSplit model):
 * creation, listing, per-split PaymentIntents, and the webhook's
 * split-paid effect.
 *
 * Phase 1 extraction (behavior-preserving, PR 1.3). Contract pins:
 *   - idempotency key  pi_split_{splitId}_{totalCents}
 *   - PI metadata tabcall_session_id + tabcall_split_id (webhook routes
 *     on the pair) + tabcall_venue_id / tabcall_table_id / tip_*
 *   - splits are sized on subtotal+tax (no tip); each payer tips on top
 *   - rounding remainder rides on the first split so pennies never
 *     go missing
 *
 * Phase 2 replaces the storage with BillSplitV2 behind this same API.
 */

type Tx = Prisma.TransactionClient;

/** Wire shape both split routes return — pinned. */
export function shapeSplit(s: BillSplit) {
  return {
    id: s.id,
    label: s.label,
    amountCents: s.amountCents,
    tipPercent: s.tipPercent,
    paidAt: s.paidAt?.toISOString() ?? null,
  };
}

export async function listSplits(sessionId: string) {
  const splits = await db.billSplit.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return splits.map(shapeSplit);
}

export type ResetSplitsResult =
  | { ok: true; splits: ReturnType<typeof shapeSplit>[] }
  | { ok: false; error: "SPLITS_ALREADY_PAID" | "EMPTY_TAB" };

/**
 * Replace any unpaid splits with a fresh even-N set. Refuses when a
 * split has already been paid (money moved — resetting would orphan
 * it). Auth/plan/paid/expired checks stay in the route.
 */
export async function resetEvenSplits(
  session: {
    id: string;
    lineItems: unknown;
    venue: { zipCode: string | null };
    splits: { paidAt: Date | null }[];
  },
  count: number,
  tipPercent: number,
): Promise<ResetSplitsResult> {
  const anyPaid = session.splits.some(s => s.paidAt);
  if (anyPaid) return { ok: false, error: "SPLITS_ALREADY_PAID" };

  const totals = tabTotals(tabItems(session.lineItems), session.venue.zipCode ?? "", 0);
  const subtotalPlusTax = totals.subtotalCents + totals.taxCents;
  if (subtotalPlusTax <= 0) return { ok: false, error: "EMPTY_TAB" };

  // Even split with the rounding remainder absorbed by the first split.
  const base = Math.floor(subtotalPlusTax / count);
  const remainder = subtotalPlusTax - base * count;
  const amounts = Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0));

  await db.$transaction([
    db.billSplit.deleteMany({ where: { sessionId: session.id } }),
    ...amounts.map((amount, i) =>
      db.billSplit.create({
        data: {
          sessionId: session.id,
          label: `Person ${i + 1}`,
          amountCents: amount,
          tipPercent,
        },
      }),
    ),
  ]);

  return { ok: true, splits: await listSplits(session.id) };
}

/* --------------------------- split payment PI --------------------------- */

export type SplitIntentResult =
  | { ok: true; clientSecret: string | null; paymentIntentId: string; tipPercent: number }
  | { ok: false; error: "EMPTY_SPLIT" };

/**
 * PaymentIntent for one split. Tip layers on TOP of the split's
 * subtotal+tax share, clamped 0–50%. Stripe errors propagate for the
 * route's stripeErrorResponse mapping.
 */
export async function createSplitPaymentIntent(
  session: { id: string; venueId: string; tableId: string; venue: { stripeAccountId: string | null } },
  split: { id: string; amountCents: number; tipPercent: number },
  tipPercentOverride: number | undefined,
): Promise<SplitIntentResult> {
  const tipPercent = tipPercentOverride ?? split.tipPercent;
  const tipCents = Math.round(split.amountCents * (Math.max(0, Math.min(50, tipPercent)) / 100));
  const totalCents = split.amountCents + tipCents;
  if (totalCents <= 0) return { ok: false, error: "EMPTY_SPLIT" };

  const platformFeeCents = Math.round(totalCents * 0.005);
  const idempotencyKey = `pi_split_${split.id}_${totalCents}`;

  const intent = await stripe().paymentIntents.create(
    {
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        tabcall_session_id: session.id,
        tabcall_split_id: split.id,
        tabcall_venue_id: session.venueId,
        tabcall_table_id: session.tableId,
        tip_cents: String(tipCents),
        tip_percent: String(tipPercent),
      },
      ...(session.venue.stripeAccountId
        ? {
            application_fee_amount: platformFeeCents,
            transfer_data: { destination: session.venue.stripeAccountId },
          }
        : {}),
    },
    { idempotencyKey },
  );

  return { ok: true, clientSecret: intent.client_secret, paymentIntentId: intent.id, tipPercent };
}

/* ------------------------- webhook: split paid -------------------------- */

/**
 * payment_intent.succeeded effect for a split: stamp the split paid,
 * flip session.paidAt when EVERY split has settled, award loyalty for
 * this split's contribution (never blocking), emit payment_confirmed
 * with the split marker. Idempotent no-ops throughout.
 */
export async function applySplitPaidFromIntent(
  tx: Tx,
  sessionId: string,
  splitId: string,
  intent: Stripe.PaymentIntent,
): Promise<void> {
  const split = await tx.billSplit.findUnique({ where: { id: splitId } });
  if (!split || split.paidAt) return;
  await tx.billSplit.update({
    where: { id: splitId },
    data: { paidAt: new Date(), stripePaymentIntentId: intent.id },
  });

  const allSplits = await tx.billSplit.findMany({
    where: { sessionId },
    select: { paidAt: true },
  });
  const allPaid = allSplits.every(s => s.paidAt !== null);

  const session = await tx.guestSession.findUnique({
    where: { id: sessionId },
    include: {
      venue: { select: { id: true, name: true, zipCode: true } },
      table: { select: { label: true } },
    },
  });
  if (!session) return;

  if (allPaid && !session.paidAt) {
    await tx.guestSession.update({
      where: { id: sessionId },
      data: { paidAt: new Date() },
    });
  }

  // Tier 3c: award loyalty points for THIS split's contribution. Points
  // never block the payment.
  if (session.guestProfileId) {
    try {
      await awardPoints(tx, session.guestProfileId, session.venueId, pointsForCents(split.amountCents));
    } catch (loyaltyErr) {
      console.error("loyalty:award:split failed", loyaltyErr);
    }
  }

  const totals = tabTotals(tabItems(session.lineItems), session.venue.zipCode ?? "", 0);
  void events.paymentConfirmed(session.venueId, session.id, {
    sessionId: session.id,
    tableLabel: session.table.label,
    venueName: session.venue.name,
    totalCents: totals.subtotalCents + totals.taxCents,
    tipCents: 0,
    tipPercent: 0,
    totalDisplay: dollars(totals.subtotalCents + totals.taxCents),
    paymentIntentId: intent.id,
    split: { splitId, allPaid },
  });
}
