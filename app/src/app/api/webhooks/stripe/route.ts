import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { parseLineItems, totalsFor, dollars } from "@/lib/bill";

export const runtime = "nodejs"; // raw body required for signature verification

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "SIGNATURE_MISSING" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }

  // Idempotency. Try to insert by Stripe event ID. If it already exists with
  // a non-null processedAt, this delivery is a retry — return 200 immediately
  // so Stripe stops retrying. If it exists but unprocessed (a previous
  // attempt crashed), fall through and try again.
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
      const existing = await db.webhookEvent.findUnique({
        where: { id: event.id },
        select: { processedAt: true },
      });
      if (existing?.processedAt) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      // unprocessed: fall through to re-attempt processing below
    } else {
      throw err;
    }
  }

  let processError: string | null = null;
  try {
    await processEvent(event);
  } catch (err) {
    processError = err instanceof Error ? err.message : "unknown";
    // Mark and rethrow so Stripe retries.
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { error: processError },
    });
    return NextResponse.json({ error: "PROCESSING_FAILED", detail: processError }, { status: 500 });
  }

  await db.webhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), error: null },
  });

  return NextResponse.json({ received: true });
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const sessionId = intent.metadata?.tabcall_session_id;
      if (!sessionId) return;
      const session = await db.guestSession.findUnique({
        where: { id: sessionId },
        include: {
          venue: { select: { id: true, name: true, zipCode: true } },
          table: { select: { label: true } },
        },
      });
      if (!session || session.paidAt) return;

      await db.guestSession.update({
        where: { id: session.id },
        data: { paidAt: new Date(), stripePaymentIntentId: intent.id },
      });

      const tipPercent = Number(intent.metadata?.tip_percent ?? session.tipPercent ?? 20);
      const totals = totalsFor(parseLineItems(session.lineItems), session.venue.zipCode ?? "", tipPercent);
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

      // TODO: FCM push to staff with table+total+tip (Phase C, requires Firebase config)
      return;
    }

    case "payment_intent.payment_failed": {
      // No DB mutation — guest will see Stripe's error in the Payment Element and can retry.
      return;
    }

    case "account.updated": {
      // Stripe Connect onboarding state change. Mirror the connected account ID onto the Venue.
      const acct = event.data.object as Stripe.Account;
      if (acct.id) {
        await db.venue.updateMany({
          where: { stripeAccountId: acct.id },
          data: { stripeAccountId: acct.id },
        });
      }
      return;
    }

    default:
      return;
  }
}
