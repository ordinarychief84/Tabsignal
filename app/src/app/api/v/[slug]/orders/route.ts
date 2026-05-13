import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { taxRateForZip } from "@/lib/tax";
import { rateLimitAsync } from "@/lib/rate-limit";

// Guest Commerce Module v2: create an Order + its derived Bill in one POST.
// The deployed flow (legacy GuestSession.lineItems + BillSplit) keeps running
// untouched — this route is on the new parallel schema (Order/Bill/BillItem)
// and is reached only from the /guest/[qrToken] surface. No Stripe call here;
// payment is deferred until the guest taps split-pay, which mints the actual
// PaymentIntent at /v/[slug]/bills/[billId]/splits.

const Body = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().max(280).optional(),
      })
    )
    .min(1)
    .max(50),
  tipCents: z.number().int().min(0).max(1_000_000).default(0),
});

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" },
      { status: 400 }
    );
  }

  // Rate-limit BEFORE the heavier work. Anonymous guests can't be authn'd
  // beyond their session token, so abusive callers get capped per-session
  // (1 order per 30s) and per-IP (30/min) to keep a misbehaving table from
  // blasting the DB.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const sessionGate = await rateLimitAsync(`order:${parsed.sessionId}`, { windowMs: 30_000, max: 1 });
  if (!sessionGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: sessionGate.retryAfterMs },
      { status: 429 }
    );
  }
  const ipGate = await rateLimitAsync(`order:ip:${ip}`, { windowMs: 60_000, max: 30 });
  if (!ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: ipGate.retryAfterMs },
      { status: 429 }
    );
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, zipCode: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const session = await db.guestSession.findUnique({
    where: { id: parsed.sessionId },
    select: {
      id: true,
      sessionToken: true,
      venueId: true,
      tableId: true,
      expiresAt: true,
    },
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

  // Resolve every menu item server-side. Never trust client-supplied prices.
  // Refuse the whole order if any line is inactive / cross-venue / missing.
  const ids = Array.from(new Set(parsed.items.map(i => i.menuItemId)));
  const dbItems = await db.menuItem.findMany({
    where: { id: { in: ids }, venueId: venue.id, isActive: true },
  });
  const byId = new Map(dbItems.map(i => [i.id, i] as const));
  if (dbItems.length !== ids.length) {
    return NextResponse.json({ error: "INVALID_ITEMS" }, { status: 400 });
  }

  const lines = parsed.items.map(line => {
    const item = byId.get(line.menuItemId)!; // existence guaranteed above
    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      priceCents: item.priceCents,
      quantity: line.quantity,
      notes: line.notes ?? null,
    };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  if (subtotalCents <= 0) {
    return NextResponse.json({ error: "EMPTY_ORDER" }, { status: 400 });
  }
  const taxRate = taxRateForZip(venue.zipCode ?? "");
  const taxCents = Math.round(subtotalCents * taxRate);
  // serviceCents is reserved for future per-venue service charges (corkage,
  // mandatory gratuity for parties of 8+, etc.). Default 0 until config lands.
  const serviceCents = 0;
  // Clamp tip server-side. 50% of subtotal+tax is the same ceiling the
  // legacy split-pay flow enforces — keeps a finger-slip from billing 500%.
  const subtotalPlusTax = subtotalCents + taxCents;
  const maxTip = Math.floor(subtotalPlusTax * 0.5);
  const tipCents = Math.max(0, Math.min(maxTip, parsed.tipCents));
  const totalCents = subtotalPlusTax + serviceCents + tipCents;

  // Atomically create Order + items + Bill + bill items so a half-created
  // order can never end up in the DB (which would block reconciliation).
  const result = await db.$transaction(async tx => {
    const order = await tx.order.create({
      data: {
        venueId: venue.id,
        tableId: session.tableId,
        guestSessionId: session.id,
        status: "NEW",
        subtotalCents,
        taxCents,
        serviceCents,
        tipCents,
        totalCents,
        items: {
          create: lines.map(l => ({
            menuItemId: l.menuItemId,
            nameSnapshot: l.nameSnapshot,
            priceCents: l.priceCents,
            quantity: l.quantity,
            notes: l.notes,
            status: "NEW" as const,
          })),
        },
      },
      include: { items: true },
    });

    // Derive the Bill 1:1 from the Order. Bill.orderId is UNIQUE — if a
    // second submitted order shares the same Stripe-side dedup window
    // the unique constraint will catch it.
    const bill = await tx.bill.create({
      data: {
        venueId: venue.id,
        tableId: session.tableId,
        orderId: order.id,
        status: "OPEN",
        subtotalCents,
        taxCents,
        serviceCents,
        tipTotalCents: tipCents,
        totalCents,
        amountPaidCents: 0,
        amountDueCents: totalCents,
        items: {
          create: order.items.map(oi => ({
            orderItemId: oi.id,
            nameSnapshot: oi.nameSnapshot,
            priceCents: oi.priceCents,
            quantity: oi.quantity,
            status: "UNPAID" as const,
          })),
        },
      },
    });

    return { orderId: order.id, billId: bill.id, totalCents };
  });

  return NextResponse.json(result);
}
