import "server-only";

/**
 * Guest-experience and relationship metrics.
 *
 * Every number here is a count of something that actually happened, and
 * the names say what was counted. There is deliberately no revenue
 * attribution: TabCall doesn't process payments and can't see a bill, so
 * any claim that it moved revenue would be invented. Rates are returned
 * with their numerator AND denominator so a venue can see that "40%
 * feedback rate" is two out of five, not two hundred out of five hundred.
 */

import { db } from "@/lib/db";

export type Rate = { count: number; of: number; pct: number | null };

function rate(count: number, of: number): Rate {
  return { count, of, pct: of === 0 ? null : Math.round((count / of) * 1000) / 10 };
}

export type GuestExperienceMetrics = {
  scans: number;
  picksUsage: Rate;
  serviceRequests: number;
  requestsPerScan: number | null;
  /** Seconds from routed to acknowledged. Null when nothing was acknowledged. */
  medianResponseSeconds: number | null;
  recoveryRequests: number;
  feedbackRate: Rate;
  averageRating: number | null;
};

export type GuestRelationshipMetrics = {
  phoneCaptureRate: Rate;
  marketingOptInRate: Rate;
  returningGuests: number;
  contacts: number;
};

export async function guestExperienceMetrics(
  venueId: string,
  since: Date,
): Promise<GuestExperienceMetrics> {
  const [scans, picks, requests, acknowledged, recovery, feedback] = await Promise.all([
    // A scan is a guest session. Sessions are reused for a table party, so
    // this counts parties, not phone taps.
    db.guestSession.count({ where: { venueId, createdAt: { gte: since } } }),
    db.wishlist.count({ where: { venueId, createdAt: { gte: since } } }),
    db.request.count({ where: { venueId, createdAt: { gte: since } } }),
    db.request.findMany({
      where: {
        venueId,
        createdAt: { gte: since },
        acknowledgedAt: { not: null },
        routedAt: { not: null },
      },
      select: { routedAt: true, acknowledgedAt: true },
      take: 2000,
    }),
    db.feedbackReport.count({
      where: { venueId, createdAt: { gte: since }, managerRecoveryRequested: true },
    }),
    db.feedbackReport.findMany({
      where: { venueId, createdAt: { gte: since } },
      select: { rating: true },
    }),
  ]);

  // Median, not mean: one request left unacknowledged over a lunch break
  // would drag an average into uselessness, and the typical wait is what a
  // manager can actually act on.
  const waits = acknowledged
    .map(r => (r.acknowledgedAt!.getTime() - r.routedAt!.getTime()) / 1000)
    .filter(s => s >= 0)
    .sort((a, b) => a - b);
  const median =
    waits.length === 0
      ? null
      : Math.round(
          waits.length % 2
            ? waits[(waits.length - 1) / 2]!
            : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2,
        );

  const averageRating =
    feedback.length === 0
      ? null
      : Math.round((feedback.reduce((n, f) => n + f.rating, 0) / feedback.length) * 10) / 10;

  return {
    scans,
    picksUsage: rate(picks, scans),
    serviceRequests: requests,
    requestsPerScan: scans === 0 ? null : Math.round((requests / scans) * 100) / 100,
    medianResponseSeconds: median,
    recoveryRequests: recovery,
    feedbackRate: rate(feedback.length, scans),
    averageRating,
  };
}

export async function guestRelationshipMetrics(
  venueId: string,
  since: Date,
): Promise<GuestRelationshipMetrics> {
  const [scans, contactsInPeriod, contacts, subscribed, visitGroups] = await Promise.all([
    db.guestSession.count({ where: { venueId, createdAt: { gte: since } } }),
    db.guestContact.count({ where: { venueId, createdAt: { gte: since } } }),
    db.guestContact.count({ where: { venueId } }),
    db.marketingConsent.count({ where: { venueId, status: "SUBSCRIBED", optedOutAt: null } }),
    db.guestVisit.groupBy({
      by: ["guestContactId"],
      where: { venueId, guestContactId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  return {
    phoneCaptureRate: rate(contactsInPeriod, scans),
    // Of the people who gave a number, how many agreed to be messaged.
    // Denominator is contacts, not scans — opt-in rate against everyone
    // who ever scanned would be a meaningless number.
    marketingOptInRate: rate(subscribed, contacts),
    returningGuests: visitGroups.filter(g => g._count._all > 1).length,
    contacts,
  };
}
