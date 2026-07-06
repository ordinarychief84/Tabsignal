import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripeErrorResponse } from "@/lib/stripe";
import { createSplitPaymentIntent } from "@/domain/billing/splits";

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

  // Tip layering, idempotency key, and PI metadata pins live in
  // domain/billing/splits. Stripe errors propagate for mapping here.
  let result;
  try {
    result = await createSplitPaymentIntent(session, split, parsed.tipPercent);
  } catch (err) {
    return stripeErrorResponse(err, "[session/splits/payment]");
  }
  if (!result.ok) return NextResponse.json({ error: "EMPTY_SPLIT" }, { status: 400 });

  await db.billSplit.update({
    where: { id: split.id },
    data: { stripePaymentIntentId: result.paymentIntentId, tipPercent: result.tipPercent },
  });

  return NextResponse.json({ clientSecret: result.clientSecret, paymentIntentId: result.paymentIntentId });
}
