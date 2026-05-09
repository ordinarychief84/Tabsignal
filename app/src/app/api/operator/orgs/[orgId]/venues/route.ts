import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess } from "@/lib/operator-rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });

  const venues = await db.venue.findMany({
    where: { orgId: ctx.params.orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      regionTag: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      createdAt: true,
    },
  });

  // Last paid session timestamp per venue (Stripe-ready vs "alive but quiet").
  const lastPaid = await db.guestSession.groupBy({
    by: ["venueId"],
    where: {
      venueId: { in: venues.map(v => v.id) },
      paidAt: { not: null },
    },
    _max: { paidAt: true },
  });
  const lastPaidByVenue = new Map(lastPaid.map(g => [g.venueId, g._max.paidAt]));

  return NextResponse.json({
    venues: venues.map(v => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      regionTag: v.regionTag,
      stripeReady: v.stripeAccountId
        ? v.stripeChargesEnabled && v.stripePayoutsEnabled
        : false,
      stripeAccountId: v.stripeAccountId,
      lastPaidAt: lastPaidByVenue.get(v.id)?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
    })),
  });
}
