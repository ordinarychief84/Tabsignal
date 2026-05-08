import { db } from "./db";
import { parseLineItems, totalsFor } from "./bill";

export type AnalyticsRange = "today" | "week" | "month";

function rangeStart(range: AnalyticsRange, timezone: string): Date {
  // Naive: server time. A timezone-aware variant would format-then-reparse
  // in the venue tz; today we accept that "today" is server-local.
  const now = new Date();
  const d = new Date(now);
  if (range === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === "week") {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type VenueAnalytics = {
  range: AnalyticsRange;
  rangeStart: string;
  rangeEnd: string;
  paidSessions: number;
  revenueCents: number;
  avgTicketCents: number;
  tipsCents: number;
  averageRating: number | null;
  ratingCount: number;
  ratingsHistogram: Record<1 | 2 | 3 | 4 | 5, number>;
  hourly: Array<{ hour: number; sessions: number; revenueCents: number }>;
  topStaff: Array<{ staffId: string; name: string; ackedCount: number }>;
  badRatingsOpen: number;
};

export async function venueAnalytics(
  venueId: string,
  range: AnalyticsRange,
): Promise<VenueAnalytics> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true, zipCode: true },
  });
  const tz = venue?.timezone ?? "America/Chicago";
  const start = rangeStart(range, tz);
  const end = new Date();

  const [paidSessions, ratingsRaw, ackedByStaff, badRatingsOpen] = await Promise.all([
    db.guestSession.findMany({
      where: { venueId, paidAt: { gte: start, lte: end } },
      select: { lineItems: true, tipPercent: true, paidAt: true },
    }),
    db.feedbackReport.findMany({
      where: { venueId, createdAt: { gte: start, lte: end } },
      select: { rating: true, seenByMgr: true },
    }),
    db.request.groupBy({
      by: ["acknowledgedById"],
      where: {
        venueId,
        acknowledgedAt: { gte: start, lte: end },
        acknowledgedById: { not: null },
      },
      _count: { id: true },
    }),
    db.feedbackReport.count({
      where: { venueId, rating: { lte: 3 }, seenByMgr: false },
    }),
  ]);

  // Revenue = sum of (subtotal + tax + tip) computed from each session's
  // saved tipPercent. Prefer this over reading Stripe charges so the
  // analytics survive even if Stripe data is unavailable.
  let revenueCents = 0;
  let tipsCents = 0;
  const hourlyMap = new Map<number, { sessions: number; revenueCents: number }>();
  for (let h = 0; h < 24; h++) hourlyMap.set(h, { sessions: 0, revenueCents: 0 });

  for (const s of paidSessions) {
    const items = parseLineItems(s.lineItems);
    const tipPct = typeof s.tipPercent === "number" ? s.tipPercent : 0;
    const t = totalsFor(items, venue?.zipCode ?? "", tipPct);
    revenueCents += t.totalCents;
    tipsCents += t.tipCents;
    if (s.paidAt) {
      const h = s.paidAt.getHours();
      const bucket = hourlyMap.get(h)!;
      bucket.sessions++;
      bucket.revenueCents += t.totalCents;
    }
  }

  const histogram: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingTotal = 0;
  for (const r of ratingsRaw) {
    const k = (r.rating as 1 | 2 | 3 | 4 | 5) ?? 0;
    if (k >= 1 && k <= 5) histogram[k]++;
    ratingTotal += r.rating;
  }
  const ratingCount = ratingsRaw.length;
  const averageRating = ratingCount > 0 ? ratingTotal / ratingCount : null;

  // Resolve staff names for top-staff list.
  const staffIds = ackedByStaff.map(r => r.acknowledgedById!).filter(Boolean);
  const staff = staffIds.length === 0
    ? []
    : await db.staffMember.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      });
  const staffById = new Map(staff.map(s => [s.id, s.name]));
  const topStaff = ackedByStaff
    .filter(r => r.acknowledgedById)
    .map(r => ({
      staffId: r.acknowledgedById!,
      name: staffById.get(r.acknowledgedById!) ?? "(unknown)",
      ackedCount: r._count.id,
    }))
    .sort((a, b) => b.ackedCount - a.ackedCount)
    .slice(0, 5);

  return {
    range,
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    paidSessions: paidSessions.length,
    revenueCents,
    avgTicketCents: paidSessions.length > 0 ? Math.round(revenueCents / paidSessions.length) : 0,
    tipsCents,
    averageRating,
    ratingCount,
    ratingsHistogram: histogram,
    hourly: Array.from(hourlyMap.entries()).map(([hour, v]) => ({ hour, ...v })),
    topStaff,
    badRatingsOpen,
  };
}
