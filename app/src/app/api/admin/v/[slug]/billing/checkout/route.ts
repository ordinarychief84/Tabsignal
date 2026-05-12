import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripe, stripeErrorResponse } from "@/lib/stripe";
import { getStaffSession } from "@/lib/auth/session";
import { planById } from "@/lib/plans";
import { appOrigin } from "@/lib/origin";
import { can } from "@/lib/auth/permissions";

const Body = z.object({
  planId: z.enum(["growth", "pro"]),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    include: { org: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  // Plan changes commit the org to recurring charges — Owner-tier only.
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "billing.change_plan")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't change plans." },
      { status: 403 }
    );
  }

  const plan = planById(parsed.planId);
  if (!plan || !plan.stripePriceId) {
    return NextResponse.json(
      { error: "PRICE_NOT_CONFIGURED", detail: `STRIPE_PRICE_${parsed.planId.toUpperCase()} env not set.` },
      { status: 503 }
    );
  }

  // One Stripe Customer per Organization. Create on first checkout.
  let customerId = venue.org.stripeCustomerId;
  if (!customerId) {
    try {
      const customer = await stripe().customers.create({
        name: venue.org.name,
        email: session.email,
        metadata: { tabcall_org_id: venue.org.id },
      });
      customerId = customer.id;
      await db.organization.update({
        where: { id: venue.org.id },
        data: { stripeCustomerId: customerId },
      });
    } catch (err) {
      return stripeErrorResponse(err, "[billing/checkout customers.create]");
    }
  }

  const origin = appOrigin(req);
  const returnUrl = `${origin}/admin/v/${ctx.params.slug}/billing?checkout=success`;
  const cancelUrl = `${origin}/admin/v/${ctx.params.slug}/billing?checkout=canceled`;

  let checkout;
  try {
    checkout = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: returnUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: { tabcall_org_id: venue.org.id, tabcall_plan_id: parsed.planId },
      },
      allow_promotion_codes: true,
    });
  } catch (err) {
    return stripeErrorResponse(err, "[billing/checkout sessions.create]");
  }

  return NextResponse.json({ url: checkout.url });
}
