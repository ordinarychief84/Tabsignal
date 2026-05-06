import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyCompToken } from "@/lib/auth/comp-token";
import { LineItem as LineItemSchema, parseLineItems } from "@/lib/bill";
import { events, emit } from "@/lib/realtime";

const Body = z.object({ token: z.string().min(1) });

/**
 * Apply a "comp this round" credit to an open guest session. Triggered by
 * the manager tapping the link in the bad-rating email. Single-use via
 * CompAction.jti; closes the loop from "we just learned about a bad
 * review" to "the guest sees the apology before they leave."
 *
 * The comp is implemented as a negative line item appended to the
 * session's lineItems JSON. Stripe sees a smaller total at PaymentIntent
 * creation time. No PaymentIntent has been created yet (or, if one has,
 * the guest would re-tap "Continue · $X" to mint a fresh one).
 */
export async function POST(req: Request) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const claims = await verifyCompToken(parsed.token);
  if (!claims) return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });

  const session = await db.guestSession.findUnique({
    where: { id: claims.sessionId },
    include: { table: { select: { label: true } } },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.venueId !== claims.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.paidAt) {
    return NextResponse.json({
      error: "ALREADY_PAID",
      detail: "The tab has already been paid. Issue the comp as a Stripe refund instead.",
    }, { status: 410 });
  }

  // Single-use enforcement: insert by jti. P2002 → already-applied. We
  // still happily report success on retry so the manager can refresh the
  // confirmation page without a scary error.
  try {
    await db.compAction.create({
      data: {
        jti: claims.jti,
        sessionId: claims.sessionId,
        venueId: claims.venueId,
        amountCents: claims.amountCents,
        reason: "manager_comp_after_bad_rating",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ ok: true, alreadyApplied: true });
    }
    throw err;
  }

  // Append the negative line item to the session.
  const items = parseLineItems(session.lineItems);
  const compItem = LineItemSchema.parse({
    name: "Comp · manager apology",
    quantity: 1,
    unitCents: -Math.abs(claims.amountCents),
  });
  await db.guestSession.update({
    where: { id: session.id },
    data: { lineItems: [...items, compItem] },
  });

  // Push to staff covering this venue so the server can deliver the comp.
  void emit({
    kind: "venue",
    id: session.venueId,
    event: "comp_applied",
    payload: {
      sessionId: session.id,
      tableLabel: session.table.label,
      amountCents: claims.amountCents,
    },
  });
  // Also nudge any guest browser still on the bill screen.
  void events.requestAcknowledged(session.venueId, session.id, {
    id: "comp",
    status: "ACKNOWLEDGED",
    type: "DRINK",
    tableLabel: session.table.label,
    note: `Comp $${(claims.amountCents / 100).toFixed(2)} applied`,
  });

  return NextResponse.json({
    ok: true,
    amountCents: claims.amountCents,
    tableLabel: session.table.label,
  });
}
