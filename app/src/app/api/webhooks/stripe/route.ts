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
      const sessionId = intent.metadata?.tabcall_session_id;
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

    default:
      return;
  }
}
