import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe, stripeErrorResponse } from "@/lib/stripe";
import { parseLineItems, totalsFor } from "@/lib/bill";

const Body = z.object({
  tipPercent: z.number().min(0).max(50).finite(),
  sessionToken: z.string().min(1),
});

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: {
      venue: {
        select: {
          zipCode: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.paidAt) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 410 });
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }
  // If the venue has a Connect account but it's not yet authorized to take
  // charges, refuse rather than minting a doomed PaymentIntent.
  if (session.venue.stripeAccountId && !session.venue.stripeChargesEnabled) {
    return NextResponse.json(
      { error: "VENUE_NOT_READY", detail: "This venue's Stripe account isn't onboarded yet." },
      { status: 503 }
    );
  }

  const items = parseLineItems(session.lineItems);
  const { totalCents, tipCents } = totalsFor(items, session.venue.zipCode ?? "", parsed.tipPercent);
  if (totalCents <= 0) return NextResponse.json({ error: "EMPTY_TAB" }, { status: 400 });

  // Stripe Connect: settle to the venue's connected account, take a 0.5% platform fee (PRD §13).
  const platformFeeCents = Math.round(totalCents * 0.005);

  // Idempotency: a guest who taps Continue twice — or whose phone retries
  // on a flaky network — must not produce two PaymentIntents. Stripe
  // dedupes by `idempotency_key` for 24h. Key on session+amount+tip so a
  // legitimate "I changed my tip" still cuts a fresh PI.
  const idempotencyKey = `pi_${session.id}_${totalCents}_${parsed.tipPercent}`;

  let intent;
  try {
    intent = await stripe().paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          tabcall_session_id: session.id,
          tabcall_venue_id: session.venueId,
          tabcall_table_id: session.tableId,
          tip_cents: String(tipCents),
          tip_percent: String(parsed.tipPercent),
        },
        ...(session.venue.stripeAccountId
          ? {
              application_fee_amount: platformFeeCents,
              transfer_data: { destination: session.venue.stripeAccountId },
            }
          : {}),
      },
      { idempotencyKey }
    );
  } catch (err) {
    return stripeErrorResponse(err, "[session/payment]");
  }

  await db.guestSession.update({
    where: { id: session.id },
    data: { stripePaymentIntentId: intent.id, tipPercent: parsed.tipPercent },
  });

  return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
}
