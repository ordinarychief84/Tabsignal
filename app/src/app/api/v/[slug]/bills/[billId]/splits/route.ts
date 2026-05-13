import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe, stripeErrorResponse } from "@/lib/stripe";
import { taxRateForZip } from "@/lib/tax";
import { rateLimitAsync } from "@/lib/rate-limit";

// Item-level Bill split (V2). The guest taps "I'll cover these items",
// we mint a single PaymentIntent for that subset and stake a claim on the
// chosen BillItems so a second guest can't try to pay for the same line.
//
// Race-condition guard: TWO concurrent POSTs at the same instant must not
// both succeed at claiming the same item. We wrap the validation +
// claim in a Postgres transaction, take a row-level lock on the Bill
// with SELECT … FOR UPDATE, re-check item statuses INSIDE the lock,
// then create the BillSplitV2 + claim rows. Whichever transaction wins
// the lock claims the items; the other re-reads them as already PAID /
// claimed and bails with 409.

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const Body = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  billItemIds: z.array(z.string().min(1)).min(1).max(100),
  tipCents: z.number().int().min(0).max(1_000_000).default(0),
});

export async function POST(
  req: Request,
  ctx: { params: { slug: string; billId: string } },
) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" },
      { status: 400 }
    );
  }

  // Per-session rate limit. 5/min is plenty for a guest fiddling with
  // their selection; it's cheap enough that an abusive script gets
  // throttled before it can spam Stripe.
  const gate = await rateLimitAsync(`splitv2:${parsed.sessionId}`, { windowMs: 60_000, max: 5 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs },
      { status: 429 }
    );
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: {
      id: true,
      zipCode: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
    },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.stripeAccountId && !venue.stripeChargesEnabled) {
    return NextResponse.json(
      { error: "VENUE_NOT_READY", detail: "This venue's Stripe account isn't onboarded yet." },
      { status: 503 }
    );
  }

  const session = await db.guestSession.findUnique({
    where: { id: parsed.sessionId },
    select: { id: true, venueId: true, tableId: true, sessionToken: true, expiresAt: true },
  });
  if (!session || session.venueId !== venue.id) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }

  const wantedIds = Array.from(new Set(parsed.billItemIds));

  // Transactional claim: lock the Bill row, re-validate, create the split,
  // stamp paidBySplitId on each chosen BillItem. Returns either a usable
  // split summary or a structured failure payload.
  type ClaimResult =
    | { ok: true; splitId: string; subtotalCents: number; taxCents: number; serviceCents: number; tipCents: number; totalCents: number }
    | { ok: false; status: number; body: { error: string; detail?: string; paidIds?: string[]; missingIds?: string[] } };

  const claim = await db.$transaction<ClaimResult>(async tx => {
    // Race-condition guard: SELECT … FOR UPDATE on the Bill row. Any
    // concurrent split-POST for the same bill will block here until we
    // commit / rollback. By the time the loser proceeds past this line,
    // our paidBySplitId stamps are visible.
    const billRows = await tx.$queryRaw<Array<{ id: string; venueId: string; tableId: string | null; status: string }>>`
      SELECT "id", "venueId", "tableId", "status"
      FROM "Bill"
      WHERE "id" = ${ctx.params.billId}
      FOR UPDATE
    `;
    const billRow = billRows[0];
    if (!billRow) {
      return { ok: false as const, status: 404, body: { error: "BILL_NOT_FOUND" } };
    }
    if (billRow.venueId !== venue.id) {
      return { ok: false as const, status: 404, body: { error: "BILL_NOT_FOUND" } };
    }
    // Tenant scoping at the table level. A guest seated at table A must not
    // be able to claim items off table B's bill even within the same venue.
    if (billRow.tableId !== session.tableId) {
      return { ok: false as const, status: 404, body: { error: "BILL_NOT_FOUND" } };
    }
    if (billRow.status === "PAID" || billRow.status === "REFUNDED" || billRow.status === "CANCELLED") {
      return { ok: false as const, status: 410, body: { error: "BILL_CLOSED", detail: `Bill is ${billRow.status}` } };
    }

    // Re-read items under the same transaction so we see anything a
    // concurrent (now-blocked) split-POST has already committed before
    // grabbing the lock.
    const items = await tx.billItem.findMany({
      where: { billId: ctx.params.billId, id: { in: wantedIds } },
    });
    if (items.length !== wantedIds.length) {
      const found = new Set(items.map(i => i.id));
      return {
        ok: false as const,
        status: 400,
        body: { error: "INVALID_ITEMS", missingIds: wantedIds.filter(id => !found.has(id)) },
      };
    }
    const alreadyPaid = items.filter(i => i.status === "PAID" || i.paidBySplitId !== null);
    if (alreadyPaid.length > 0) {
      return {
        ok: false as const,
        status: 409,
        body: { error: "ITEMS_ALREADY_CLAIMED", paidIds: alreadyPaid.map(i => i.id) },
      };
    }

    // Server-authoritative math. The client never sends totalCents.
    const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    if (subtotalCents <= 0) {
      return { ok: false as const, status: 400, body: { error: "EMPTY_SPLIT" } };
    }
    const taxRate = taxRateForZip(venue.zipCode ?? "");
    const taxCents = Math.round(subtotalCents * taxRate);
    const serviceCents = 0; // reserved; per-venue config in a later phase
    const subtotalPlusTax = subtotalCents + taxCents;
    const maxTip = Math.floor(subtotalPlusTax * 0.5);
    const tipCents = Math.max(0, Math.min(maxTip, parsed.tipCents));
    const totalCents = subtotalPlusTax + serviceCents + tipCents;

    const split = await tx.billSplitV2.create({
      data: {
        billId: ctx.params.billId,
        guestSessionId: session.id,
        status: "PENDING",
        subtotalCents,
        taxCents,
        serviceCents,
        tipCents,
        totalCents,
        splitItems: {
          create: items.map(i => ({
            billItemId: i.id,
            // Per-item allocation: at item-level resolution we charge the
            // full priceCents*quantity for each chosen line. Tax/tip live on
            // the parent split rather than per-line.
            amountCents: i.priceCents * i.quantity,
          })),
        },
      },
    });

    // Stake the claim. Items stay status=UNPAID until the webhook confirms
    // the PaymentIntent succeeded; paidBySplitId is enough to keep a second
    // split-POST from re-claiming.
    await tx.billItem.updateMany({
      where: { id: { in: items.map(i => i.id) } },
      data: { paidBySplitId: split.id },
    });

    return {
      ok: true as const,
      splitId: split.id,
      subtotalCents,
      taxCents,
      serviceCents,
      tipCents,
      totalCents,
    };
  });

  if (!claim.ok) {
    return NextResponse.json(claim.body, { status: claim.status });
  }

  // Mint the Stripe PaymentIntent OUTSIDE the DB transaction. Holding a
  // row lock during a network call to Stripe would be a noisy footgun.
  // The split is already PENDING with its items claimed — if Stripe fails
  // here we leave the row and let a retry pick it up via the idempotency
  // key; manual cleanup is possible from admin.
  const platformFeeCents = Math.round(claim.totalCents * 0.005);
  const idempotencyKey = `pi_v2_${claim.splitId}_${claim.totalCents}_${claim.tipCents}`;

  let intent;
  try {
    intent = await stripe().paymentIntents.create(
      {
        amount: claim.totalCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          tabcall_v2_split_id: claim.splitId,
          tabcall_v2_bill_id: ctx.params.billId,
          tabcall_venue_id: venue.id,
          tabcall_session_id: session.id,
          subtotal_cents: String(claim.subtotalCents),
          tax_cents: String(claim.taxCents),
          tip_cents: String(claim.tipCents),
        },
        ...(venue.stripeAccountId
          ? {
              application_fee_amount: platformFeeCents,
              transfer_data: { destination: venue.stripeAccountId },
            }
          : {}),
      },
      { idempotencyKey }
    );
  } catch (err) {
    return stripeErrorResponse(err, "[v2/bills/splits]");
  }

  await db.billSplitV2.update({
    where: { id: claim.splitId },
    data: { stripePaymentIntentId: intent.id },
  });

  return NextResponse.json({
    splitId: claim.splitId,
    clientSecret: intent.client_secret,
    totals: {
      subtotalCents: claim.subtotalCents,
      taxCents: claim.taxCents,
      serviceCents: claim.serviceCents,
      tipCents: claim.tipCents,
      totalCents: claim.totalCents,
    },
  });
}
