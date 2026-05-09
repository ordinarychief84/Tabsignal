import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess } from "@/lib/operator-rbac";
import { venueAnalytics, type AnalyticsRange } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });

  const url = new URL(req.url);
  const rangeParam = url.searchParams.get("range");
  const range: AnalyticsRange =
    rangeParam === "today" ? "today" : rangeParam === "month" ? "month" : "week";

  const venues = await db.venue.findMany({
    where: { orgId: ctx.params.orgId },
    select: { id: true, slug: true, name: true, regionTag: true },
    orderBy: { name: "asc" },
  });

  const perVenue = await Promise.all(
    venues.map(async v => {
      const a = await venueAnalytics(v.id, range);
      return {
        venueId: v.id,
        slug: v.slug,
        name: v.name,
        regionTag: v.regionTag,
        revenueCents: a.revenueCents,
        paidSessions: a.paidSessions,
        avgTicketCents: a.avgTicketCents,
        tipsCents: a.tipsCents,
        averageRating: a.averageRating,
        badRatingsOpen: a.badRatingsOpen,
      };
    })
  );

  const totals = perVenue.reduce(
    (acc, v) => ({
      revenueCents: acc.revenueCents + v.revenueCents,
      paidSessions: acc.paidSessions + v.paidSessions,
      tipsCents: acc.tipsCents + v.tipsCents,
      badRatingsOpen: acc.badRatingsOpen + v.badRatingsOpen,
    }),
    { revenueCents: 0, paidSessions: 0, tipsCents: 0, badRatingsOpen: 0 }
  );

  // Sort for "top" and "lagging" lists. Defensive copy so callers can't
  // mutate the original array.
  const ranked = [...perVenue].sort((a, b) => b.revenueCents - a.revenueCents);
  const top = ranked.slice(0, 3);
  const lagging = ranked
    .filter(v => v.paidSessions > 0)
    .slice(-3)
    .reverse();

  return NextResponse.json({
    orgId: ctx.params.orgId,
    range,
    totals,
    venues: perVenue,
    top,
    lagging,
  });
}
