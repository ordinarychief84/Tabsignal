import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const Body = z.object({
  sessionToken: z.string().min(1),
  tipPercent: z.number().min(0).max(50).finite().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: { id: string; splitId: string } }
) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: {
      venue: { select: { stripeAccountId: true, stripeChargesEnabled: true } },
      splits: true,
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
  if (session.venue.stripeAccountId && !session.venue.stripeChargesEnabled) {
    return NextResponse.json(
      { error: "VENUE_NOT_READY", detail: "This venue's Stripe account isn't onboarded yet." },
      { status: 503 }
    );
  }

  const split = session.splits.find(s => s.id === ctx.params.splitId);
  if (!split) return NextResponse.json({ error: "SPLIT_NOT_FOUND" }, { status: 404 });
  if (split.paidAt) return NextResponse.json({ error: "SPLIT_ALREADY_PAID" }, { status: 410 });

  // Tip is layered on TOP of the split's pre-tax amount. The split was sized
  // by subtotal+tax; the payer chooses their own tip percent.
  const tipPercent = parsed.tipPercent ?? split.tipPercent;
  const tipCents = Math.round(split.amountCents * (Math.max(0, Math.min(50, tipPercent)) / 100));
  const totalCents = split.amountCents + tipCents;
  if (totalCents <= 0) return NextResponse.json({ error: "EMPTY_SPLIT" }, { status: 400 });

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
    { idempotencyKey }
  );

  await db.billSplit.update({
    where: { id: split.id },
    data: { stripePaymentIntentId: intent.id, tipPercent },
  });

  return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
}
