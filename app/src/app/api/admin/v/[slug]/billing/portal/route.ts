import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { getStaffSession } from "@/lib/auth/session";
import { appOrigin } from "@/lib/origin";

// Stripe Customer Portal: cancel, update card, view invoices. Tied to
// the org's stripeCustomerId. Returns a hosted URL the manager opens
// in a new tab.
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    include: { org: { select: { id: true, stripeCustomerId: true } } },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (!venue.org.stripeCustomerId) {
    return NextResponse.json(
      { error: "NO_SUBSCRIPTION", detail: "Start a subscription before opening the portal." },
      { status: 400 }
    );
  }

  const origin = appOrigin(req);
  const portal = await stripe().billingPortal.sessions.create({
    customer: venue.org.stripeCustomerId,
    return_url: `${origin}/admin/v/${ctx.params.slug}/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
