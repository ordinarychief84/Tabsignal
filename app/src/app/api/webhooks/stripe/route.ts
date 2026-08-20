import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
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
  let lastVerifyError: unknown = null;
  for (const secret of secrets) {
    try {
      event = stripe().webhooks.constructEvent(raw, sig, secret);
      lastVerifyError = null;
      break;
    } catch (err) {
      // Try next secret (live vs test mode). Capture the last error so
      // we can log it if both attempts fail — a silent 400 makes a real
      // Stripe outage indistinguishable from a misconfigured secret.
      lastVerifyError = err;
    }
  }
  if (!event) {
    // Log enough context to root-cause from Vercel logs: Stripe's
    // verification errors include the failing condition (timestamp out
    // of tolerance, signature header malformed, no matching v1 signature).
    console.error("[stripe/webhook] signature verification failed", {
      secretsTried: secrets.length,
      error: lastVerifyError instanceof Error ? lastVerifyError.message : String(lastVerifyError),
    });
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
    // Guest payment branches (payment_intent.*, charge.refunded,
    // charge.dispute.*, account.updated, account.application.deauthorized)
    // were removed with the guest-payment feature. TabCall no longer
    // charges guests, so no PaymentIntent, refund, dispute or Connect
    // account belongs to us any more — guests settle with the venue
    // directly, on the venue's own terminal.
    //
    // What remains is TabCall billing its VENUES for the subscription,
    // which is a different money flow entirely and stays.

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

