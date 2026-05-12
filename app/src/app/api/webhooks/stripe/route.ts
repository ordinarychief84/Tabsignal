import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { events, emit } from "@/lib/realtime";
import { parseLineItems, totalsFor, dollars } from "@/lib/bill";
import { awardPoints, pointsForCents } from "@/lib/loyalty";
import { subscriptionStatusFor } from "@/lib/stripe-helpers";

export const runtime = "nodejs"; // raw body required for signature verification

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_TEST].filter(
    (s): s is string => !!s,
  );
  if (!sig || secrets.length === 0) {
    return NextResponse.json({ error: "SIGNATURE_MISSING" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(raw, sig, secret);
      break;
    } catch {
      // try next secret (live vs test mode)
    }
  }
  if (!event) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  // Idempotency. Try to insert by Stripe event ID; on conflict the original
  // delivery wins. Concurrent retries serialize through a row-level lock so
  // we never run processEvent twice for the same event.
  try {
    await db.webhookEvent.create({
      data: {
        id: event.id,
        type: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" // unique constraint
    ) {
      // Concurrent or duplicate delivery — fall through to the locked read.
    } else {
      throw err;
    }
  }

  try {
    const result = await db.$transaction(async tx => {
      // Lock the row for the duration of processing. SELECT … FOR UPDATE
      // serializes parallel deliveries so only one runs processEvent.
      const rows = await tx.$queryRaw<Array<{ processedAt: Date | null }>>`
        SELECT "processedAt" FROM "WebhookEvent" WHERE "id" = ${event.id} FOR UPDATE
      `;
      const row = rows[0];
      if (!row) throw new Error("WEBHOOK_ROW_MISSING");
      if (row.processedAt) {
        return { duplicate: true as const };
      }
      await processEvent(event, tx);
      await tx.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: null },
      });
      return { duplicate: false as const };
    });
    if (result.duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: detail } }).catch(() => {});
    return NextResponse.json({ error: "PROCESSING_FAILED", detail }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function processEvent(event: Stripe.Event, tx: Tx) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const preOrderId = intent.metadata?.tabcall_preorder_id;
      // Pre-order payment: mark order paid so it appears on the staff queue.
      if (preOrderId) {
        const pre = await tx.preOrder.findUnique({ where: { id: preOrderId } });
        if (!pre || pre.paidAt) return;
        await tx.preOrder.update({
          where: { id: preOrderId },
          data: { paidAt: new Date(), stripePaymentIntentId: intent.id },
        });
        // Realtime nudge so staff queue updates instantly.
        void events.preOrderPaid(pre.venueId, {
          id: pre.id,
          pickupCode: pre.pickupCode,
          totalCents: pre.totalCents,
        });
        return;
      }

      const sessionId = intent.metadata?.tabcall_session_id;
      const splitId = intent.metadata?.tabcall_split_id;
      // Split payment: mark the split, and mark the session paid only when
      // every split has been settled. The non-split path falls through.
      if (splitId && sessionId) {
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

        // Tier 3c: award loyalty points for THIS split's contribution.
        // Points never block the payment — wrap in try/catch so a points
        // bug can't break the rest of the webhook.
        if (session.guestProfileId) {
          try {
            await awardPoints(tx, session.guestProfileId, session.venueId, pointsForCents(split.amountCents));
          } catch (loyaltyErr) {
            console.error("loyalty:award:split failed", loyaltyErr);
          }
        }

        const totals = totalsFor(parseLineItems(session.lineItems), session.venue.zipCode ?? "", 0);
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
        return;
      }

      if (!sessionId) return;
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
      const totals = totalsFor(parseLineItems(session.lineItems), session.venue.zipCode ?? "", tipPercent);

      // Tier 3c: award loyalty for the full session payment. Points are
      // computed off the subtotal+tax (not the tip).
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
      return;
    }

    case "payment_intent.payment_failed": {
      // No DB mutation — guest will see Stripe's error in the Payment Element and can retry.
      return;
    }

    case "charge.refunded": {
      // A refund landed (manager issued from Stripe Dashboard or
      // Customer Portal). Reflect it on the guest session / pre-order /
      // split so the manager UI shows the refunded state instead of a
      // stale "paid". We DON'T flip paidAt back to null — the tab was
      // settled, it's just been refunded. We add a metadata flag so
      // the manager dashboard can render "Refunded" badges.
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
      if (!intentId) return;

      const refundedCents = charge.amount_refunded ?? 0;
      const refundedAt = new Date();

      // Sessions: match by stripePaymentIntentId.
      const sessionMatch = await tx.guestSession.findFirst({
        where: { stripePaymentIntentId: intentId },
        include: { venue: { select: { id: true } }, table: { select: { label: true } } },
      });
      if (sessionMatch) {
        await tx.guestSession.update({
          where: { id: sessionMatch.id },
          data: {
            // Record refund in lineItems metadata. We append a synthetic
            // negative line item so downstream readers see the net total
            // change without us needing a dedicated refunds table.
            lineItems: [
              ...parseLineItems(sessionMatch.lineItems),
              {
                name: charge.amount_refunded === charge.amount
                  ? "Refunded (full)"
                  : `Refunded ($${(refundedCents / 100).toFixed(2)})`,
                quantity: 1,
                unitCents: -Math.abs(refundedCents),
                isRefund: true,
              } as unknown as Prisma.InputJsonValue,
            ] as unknown as Prisma.InputJsonValue,
          },
        });
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
        return;
      }

      // Splits: match by stripePaymentIntentId on BillSplit.
      const splitMatch = await tx.billSplit.findFirst({
        where: { stripePaymentIntentId: intentId },
        include: { session: { select: { venueId: true, table: { select: { label: true } } } } },
      });
      if (splitMatch) {
        await tx.billSplit.update({
          where: { id: splitMatch.id },
          // Mark paidAt=null only on a full refund; partial refunds keep
          // the split paid (the guest is just getting some money back).
          data: refundedCents >= splitMatch.amountCents ? { paidAt: null } : {},
        });
        void emit({
          kind: "venue",
          id: splitMatch.session.venueId,
          event: "payment_refunded",
          payload: {
            sessionId: splitMatch.sessionId,
            splitId: splitMatch.id,
            tableLabel: splitMatch.session.table.label,
            refundedCents,
            refundedAt: refundedAt.toISOString(),
            chargeId: charge.id,
          },
        });
        return;
      }

      // Pre-orders: match by stripePaymentIntentId on PreOrder.
      const preMatch = await tx.preOrder.findFirst({
        where: { stripePaymentIntentId: intentId },
      });
      if (preMatch) {
        await tx.preOrder.update({
          where: { id: preMatch.id },
          data: refundedCents >= preMatch.totalCents
            ? { status: "CANCELED" }
            : {},
        });
        void emit({
          kind: "venue",
          id: preMatch.venueId,
          event: "preorder_refunded",
          payload: {
            preOrderId: preMatch.id,
            refundedCents,
            refundedAt: refundedAt.toISOString(),
            chargeId: charge.id,
          },
        });
      }
      return;
    }

    case "account.updated": {
      // Stripe Connect onboarding state. Persist the onboarding flags so
      // the manager dashboard / settings page can show real status, and
      // /api/session/:id/payment can refuse intents to non-onboarded venues.
      const acct = event.data.object as Stripe.Account;
      if (!acct.id) return;
      await tx.venue.updateMany({
        where: { stripeAccountId: acct.id },
        data: {
          stripeChargesEnabled: !!acct.charges_enabled,
          stripePayoutsEnabled: !!acct.payouts_enabled,
          stripeDetailsSubmitted: !!acct.details_submitted,
        },
      });
      return;
    }

    case "account.application.deauthorized": {
      // The venue revoked TabCall's Connect access. Stripe sends `account`
      // on the event itself, not in event.data. Mark the venue as not-ready.
      const acctId = (event as Stripe.Event & { account?: string }).account;
      if (!acctId) return;
      await tx.venue.updateMany({
        where: { stripeAccountId: acctId },
        data: {
          stripeAccountId: null,
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeDetailsSubmitted: false,
        },
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.tabcall_org_id;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      // Match by metadata first (set on checkout) and fall back to customer
      // id so subs created in the Stripe dashboard still attach correctly.
      const org = orgId
        ? await tx.organization.findUnique({ where: { id: orgId } })
        : await tx.organization.findFirst({ where: { stripeCustomerId: customerId } });
      if (!org) return;

      const status = subscriptionStatusFor(sub.status);
      const priceId = sub.items.data[0]?.price.id ?? null;
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null;
      const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

      await tx.organization.update({
        where: { id: org.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: status,
          subscriptionPriceId: priceId,
          subscriptionPeriodEnd: periodEnd,
          trialEndsAt: trialEnd,
        },
      });
      return;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await tx.organization.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionStatus: "CANCELED",
          subscriptionPriceId: null,
          subscriptionPeriodEnd: null,
        },
      });
      return;
    }

    default:
      return;
  }
}

