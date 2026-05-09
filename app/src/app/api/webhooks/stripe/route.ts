import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { parseLineItems, totalsFor, dollars } from "@/lib/bill";
import { awardPoints, pointsForCents } from "@/lib/loyalty";

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

function subscriptionStatusFor(s: Stripe.Subscription.Status): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "NONE" {
  switch (s) {
    case "trialing": return "TRIALING";
    case "active":   return "ACTIVE";
    case "past_due": return "PAST_DUE";
    case "unpaid":   return "PAST_DUE";
    case "incomplete": return "PAST_DUE";
    case "canceled": return "CANCELED";
    case "incomplete_expired": return "CANCELED";
    case "paused":   return "CANCELED";
    default:         return "NONE";
  }
}
