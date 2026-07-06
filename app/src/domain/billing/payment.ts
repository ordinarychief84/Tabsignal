import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { dollars } from "@/lib/bill";
import { awardPoints, pointsForCents } from "@/lib/loyalty";
import { events, emit } from "@/lib/realtime";
import { tabItems, tabTotals, appendTabLine } from "@/domain/billing/tab";

/**
 * domain/billing/payment — the session payment lifecycle:
 * PaymentIntent creation and the webhook's session-scoped effects
 * (mark paid + loyalty + realtime, refund ledger append).
 *
 * Phase 1 extraction (behavior-preserving, PR 1.2). Contract pins that
 * MUST NOT drift — external systems depend on them:
 *   - idempotency key format  pi_{sessionId}_{totalCents}_{tipPercent}
 *     (Stripe dedupes retries on it for 24h)
 *   - PI metadata keys tabcall_session_id / tabcall_venue_id /
 *     tabcall_table_id / tip_cents / tip_percent (the webhook routes on
 *     tabcall_session_id — it is the permanent fallback branch through
 *     the Phase 2 cutover and beyond)
 *   - platform fee 0.5% via transfer_data when the venue is onboarded
 *
 * Splits (legacy BillSplit + V2) and pre-order branches are NOT here —
 * they move to domain/billing/splits.ts in PR 1.3.
 */

type Tx = Prisma.TransactionClient;

/* --------------------------- intent creation --------------------------- */

export type TabPaymentSession = {
  id: string;
  venueId: string;
  tableId: string;
  lineItems: unknown;
  venue: { zipCode: string | null; stripeAccountId: string | null };
};

export type CreateIntentResult =
  | { ok: true; clientSecret: string | null; paymentIntentId: string }
  | { ok: false; error: "EMPTY_TAB" };

/**
 * Create (or idempotently re-fetch) the PaymentIntent for a full-tab
 * payment. Stripe SDK errors intentionally propagate — the route maps
 * them via stripeErrorResponse, exactly as before.
 */
export async function createTabPaymentIntent(
  session: TabPaymentSession,
  tipPercent: number,
): Promise<CreateIntentResult & { totalCents?: number; tipCents?: number }> {
  const items = tabItems(session.lineItems);
  const { totalCents, tipCents } = tabTotals(items, session.venue.zipCode ?? "", tipPercent);
  if (totalCents <= 0) return { ok: false, error: "EMPTY_TAB" };

  // Stripe Connect: settle to the venue's connected account, take a 0.5%
  // platform fee (PRD §13).
  const platformFeeCents = Math.round(totalCents * 0.005);

  // Idempotency: a guest who taps Continue twice — or whose phone retries
  // on a flaky network — must not produce two PaymentIntents. Stripe
  // dedupes by `idempotency_key` for 24h. Key on session+amount+tip so a
  // legitimate "I changed my tip" still cuts a fresh PI.
  const idempotencyKey = `pi_${session.id}_${totalCents}_${tipPercent}`;

  const intent = await stripe().paymentIntents.create(
    {
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        tabcall_session_id: session.id,
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

  return {
    ok: true,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    totalCents,
    tipCents,
  };
}

/* ------------------------- webhook: session paid ------------------------ */

/**
 * Full-session payment_intent.succeeded effect: stamp paidAt, award
 * loyalty (never blocking), emit payment_confirmed to venue + guest.
 * No-ops for unknown or already-paid sessions (webhook idempotency).
 */
export async function markSessionPaidFromIntent(
  tx: Tx,
  sessionId: string,
  intent: Stripe.PaymentIntent,
): Promise<void> {
  const session = await tx.guestSession.findUnique({
    where: { id: sessionId },
    include: {
      venue: { select: { id: true, name: true, zipCode: true } },
      table: { select: { label: true } },
    },
  });
  if (!session || session.paidAt) return;

  await tx.guestSession.update({
    where: { id: session.id },
    data: { paidAt: new Date(), stripePaymentIntentId: intent.id },
  });

  const tipPercent = Number(intent.metadata?.tip_percent ?? session.tipPercent ?? 20);
  const totals = tabTotals(tabItems(session.lineItems), session.venue.zipCode ?? "", tipPercent);

  // Tier 3c: award loyalty for the full session payment. Points are
  // computed off the subtotal+tax (not the tip) and never block the
  // payment — a points bug can't break the rest of the webhook.
  if (session.guestProfileId) {
    try {
      await awardPoints(
        tx,
        session.guestProfileId,
        session.venueId,
        pointsForCents(totals.subtotalCents + totals.taxCents),
      );
    } catch (loyaltyErr) {
      console.error("loyalty:award:single failed", loyaltyErr);
    }
  }
  void events.paymentConfirmed(session.venueId, session.id, {
    sessionId: session.id,
    tableLabel: session.table.label,
    venueName: session.venue.name,
    totalCents: totals.totalCents,
    tipCents: totals.tipCents,
    tipPercent,
    totalDisplay: dollars(totals.totalCents),
    paymentIntentId: intent.id,
  });
}

/* ------------------------ webhook: session refund ----------------------- */

/**
 * charge.refunded effect for a full-session payment. Appends a synthetic
 * negative "Refunded" line (isRefund marker) so downstream readers see
 * the net change without a refunds table; paidAt deliberately stays set
 * (the tab WAS settled). Returns false when no session matches this
 * intent so the webhook can fall through to split / pre-order matching.
 */
export async function applyChargeRefundToSession(
  tx: Tx,
  intentId: string,
  charge: Stripe.Charge,
): Promise<boolean> {
  const sessionMatch = await tx.guestSession.findFirst({
    where: { stripePaymentIntentId: intentId },
    include: { venue: { select: { id: true } }, table: { select: { label: true } } },
  });
  if (!sessionMatch) return false;

  const refundedCents = charge.amount_refunded ?? 0;
  const refundedAt = new Date();

  // Parse-then-append (legacy refund-branch semantics — existing junk
  // stripped, the refund's own isRefund marker rides raw).
  await appendTabLine(
    tx,
    { id: sessionMatch.id, lineItems: tabItems(sessionMatch.lineItems) },
    {
      name:
        charge.amount_refunded === charge.amount
          ? "Refunded (full)"
          : `Refunded ($${(refundedCents / 100).toFixed(2)})`,
      quantity: 1,
      unitCents: -Math.abs(refundedCents),
      isRefund: true,
    },
  );

  void emit({
    kind: "venue",
    id: sessionMatch.venue.id,
    event: "payment_refunded",
    payload: {
      sessionId: sessionMatch.id,
      tableLabel: sessionMatch.table.label,
      refundedCents,
      refundedAt: refundedAt.toISOString(),
      chargeId: charge.id,
    },
  });
  return true;
}
