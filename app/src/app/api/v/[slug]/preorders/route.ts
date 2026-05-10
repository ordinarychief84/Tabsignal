import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe, stripeErrorResponse } from "@/lib/stripe";
import { taxRateForZip } from "@/lib/tax";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";

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

function pickupCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
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

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: {
      id: true,
      zipCode: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!meetsAtLeast(planFromOrg(venue.org), "growth")) {
    // Pre-order requires Growth — 404 so we don't leak feature availability.
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (venue.stripeAccountId && !venue.stripeChargesEnabled) {
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
  const taxRate = taxRateForZip(venue.zipCode ?? "");
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
      pickupCode: pickupCode(),
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
        ...(venue.stripeAccountId
          ? {
              application_fee_amount: platformFeeCents,
              transfer_data: { destination: venue.stripeAccountId },
            }
          : {}),
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
