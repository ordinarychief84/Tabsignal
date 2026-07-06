import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripeErrorResponse } from "@/lib/stripe";
import { createTabPaymentIntent } from "@/domain/billing/payment";

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

  // Intent creation (totals, 0.5% platform fee, idempotency key, PI
  // metadata) lives in domain/billing/payment — contract pins documented
  // there. Stripe SDK errors propagate for stripeErrorResponse mapping.
  let result;
  try {
    result = await createTabPaymentIntent(session, parsed.tipPercent);
  } catch (err) {
    return stripeErrorResponse(err, "[session/payment]");
  }
  if (!result.ok) return NextResponse.json({ error: "EMPTY_TAB" }, { status: 400 });

  await db.guestSession.update({
    where: { id: session.id },
    data: { stripePaymentIntentId: result.paymentIntentId, tipPercent: parsed.tipPercent },
  });

  return NextResponse.json({ clientSecret: result.clientSecret, paymentIntentId: result.paymentIntentId });
}
