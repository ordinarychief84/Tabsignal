import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe, stripeErrorResponse } from "@/lib/stripe";
import { randomInt } from "node:crypto";
import { resolveTaxRate } from "@/lib/tax";
import { canTakePaymentsInCountry } from "@/lib/countries";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { rateLimitAsync } from "@/lib/rate-limit";

const Body = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
      })
    )
    .min(1)
    .max(50),
  guestName: z.string().min(1).max(120).optional(),
  guestPhone: z.string().min(7).max(40).optional(),
  notes: z.string().max(280).optional(),
  tipPercent: z.number().min(0).max(50).finite().default(0),
  tableId: z.string().optional(),
});

/**
 * Pickup code. This is the ONLY credential on the public pre-order read
 * (GET /api/v/[slug]/preorders/[id]), so it must be unguessable, not just
 * unique: `Math.random()` is a predictable PRNG and 4 digits is a 9,000-
 * value space. Six crypto-random digits, retried against the venue's
 * currently-open orders so two guests never hold the same code at once.
 */
async function uniquePickupCode(venueId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInt(100_000, 1_000_000).toString();
    const clash = await db.preOrder.findFirst({
      where: { venueId, pickupCode: code, pickedUpAt: null },
      select: { id: true },
    });
    if (!clash) return code;
  }
  // 10 collisions against open orders is not a real-world state; fail
  // loudly rather than handing out a duplicate code.
  throw new Error("pickup_code_exhausted");
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

  // Rate limit BEFORE hitting the DB / Stripe. Pre-orders are anonymous
  // and each successful POST mints a Stripe PaymentIntent — without this,
  // a spammer can burn Stripe API budget and pollute the DB with abandoned
  // orders. Per-IP + per-slug gives reasonable headroom for a legitimate
  // table while blocking burst abuse.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const slug = ctx.params.slug;
  const ipGate = await rateLimitAsync(`preorder:ip:${ip}:${slug}`, { windowMs: 60_000, max: 5 });
  if (!ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: ipGate.retryAfterMs },
      { status: 429 }
    );
  }
  const slugGate = await rateLimitAsync(`preorder:slug:${slug}`, { windowMs: 60_000, max: 60 });
  if (!slugGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: slugGate.retryAfterMs },
      { status: 429 }
    );
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: {
      id: true,
      country: true,
      zipCode: true,
      taxRateBps: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } },
    },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!meetsAtLeast(planFromOrg(venue.org), "growth")) {
    // Pre-order requires Growth — 404 so we don't leak feature availability.
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  // USD-denominated with tax added on top — see PAYMENT_COUNTRIES.
  if (!canTakePaymentsInCountry(venue.country)) {
    return NextResponse.json(
      { error: "COUNTRY_UNSUPPORTED", detail: "TabCall can't take payments in this country yet." },
      { status: 503 },
    );
  }

  // A venue with no connected account would settle this payment into the
  // PLATFORM balance, so refuse rather than take money we can't route.
  if (!venue.stripeAccountId || !venue.stripeChargesEnabled) {
    return NextResponse.json(
      { error: "VENUE_NOT_READY", detail: "Pre-orders aren't accepted yet at this venue." },
      { status: 503 }
    );
  }

  // Resolve item prices server-side. Never trust client-supplied prices.
  const ids = Array.from(new Set(parsed.items.map(i => i.menuItemId)));
  const dbItems = await db.menuItem.findMany({
    where: { id: { in: ids }, venueId: venue.id, isActive: true },
  });
  const byId = new Map(dbItems.map(i => [i.id, i] as const));

  const denormalized = parsed.items.map(line => {
    const item = byId.get(line.menuItemId);
    if (!item) return null;
    return {
      menuItemId: item.id,
      name: item.name,
      quantity: line.quantity,
      unitCents: item.priceCents,
    };
  });
  if (denormalized.some(l => l === null)) {
    return NextResponse.json({ error: "INVALID_ITEMS" }, { status: 400 });
  }

  const subtotalCents = denormalized.reduce((s, it) => s + it!.quantity * it!.unitCents, 0);
  if (subtotalCents <= 0) {
    return NextResponse.json({ error: "EMPTY_ORDER" }, { status: 400 });
  }
  const taxRate = resolveTaxRate(venue);
  if (taxRate === null) {
    // No resolvable sales-tax rate — charging now would under-collect tax
    // the venue is liable for. Setup fault, so 503 not 400.
    return NextResponse.json(
      { error: "TAX_RATE_UNSET", detail: "This venue hasn't set its sales-tax rate yet." },
      { status: 503 }
    );
  }
  const taxCents = Math.round(subtotalCents * taxRate);
  const subtotalPlusTax = subtotalCents + taxCents;
  const tipCents = Math.round(subtotalPlusTax * (parsed.tipPercent / 100));
  const totalCents = subtotalPlusTax + tipCents;

  const platformFeeCents = Math.round(totalCents * 0.005);

  const preOrder = await db.preOrder.create({
    data: {
      venueId: venue.id,
      tableId: parsed.tableId ?? null,
      items: denormalized as object[],
      subtotalCents,
      tipCents,
      totalCents,
      guestName: parsed.guestName ?? null,
      guestPhone: parsed.guestPhone ?? null,
      notes: parsed.notes ?? null,
      pickupCode: await uniquePickupCode(venue.id),
    },
  });

  let intent;
  try {
    intent = await stripe().paymentIntents.create(
      {
        amount: totalCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          tabcall_preorder_id: preOrder.id,
          tabcall_venue_id: venue.id,
          tip_cents: String(tipCents),
          tip_percent: String(parsed.tipPercent),
        },
        // Unconditional — guarded above.
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: venue.stripeAccountId },
      },
      { idempotencyKey: `pi_preorder_${preOrder.id}` }
    );
  } catch (err) {
    return stripeErrorResponse(err, "[preorders/payment]");
  }

  await db.preOrder.update({
    where: { id: preOrder.id },
    data: { stripePaymentIntentId: intent.id },
  });

  return NextResponse.json({
    preOrderId: preOrder.id,
    pickupCode: preOrder.pickupCode,
    clientSecret: intent.client_secret,
    totals: { subtotalCents, taxCents, tipCents, totalCents },
  });
}
