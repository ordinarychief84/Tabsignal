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
import { DISCOVERY_EVENTS, SPECIAL_EVENTS } from "@/lib/guest-events";

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


/* ------------------------- discovery, from events ------------------------- */

export type MenuDiscoveryMetrics = {
  /** Sessions that got past the welcome and looked at something. */
  explorationRate: Rate;
  /** Sessions that engaged with a special or the chef's round. */
  specialEngagementRate: Rate;
  specialsRevealed: number;
  chefPickCompletionRate: Rate;
  mostViewed: { menuItemId: string; name: string; count: number }[];
  mostSaved: { menuItemId: string; name: string; count: number }[];
  /**
   * Items saved after the venue's own pairing suggested them. NOT
   * revenue — see the note on the return type of this module. TabCall
   * cannot see a bill, so it can only report that a guest shortlisted
   * something, never that anyone paid for it.
   */
  savedAfterSuggestion: number;
};

/**
 * What guests actually did with the menu.
 *
 * Every rate here has a denominator of SESSIONS, not events, so "60%
 * exploration" means six visits in ten rather than something derived
 * from how many taps the busiest table made. Counting distinct sessions
 * is the difference between a number a manager can act on and a number
 * that rewards one enthusiastic guest.
 */
export async function menuDiscoveryMetrics(
  venueId: string,
  since: Date,
): Promise<MenuDiscoveryMetrics> {
  const [
    sessions,
    exploredSessions,
    specialSessions,
    specialsRevealed,
    chefStarted,
    chefCompleted,
    viewed,
    saved,
    savedAfterSuggestion,
  ] = await Promise.all([
    db.guestSession.count({ where: { venueId, createdAt: { gte: since } } }),
    distinctSessions(venueId, since, DISCOVERY_EVENTS),
    distinctSessions(venueId, since, SPECIAL_EVENTS),
    db.guestEvent.count({
      where: { venueId, createdAt: { gte: since }, type: "special_revealed" },
    }),
    distinctSessions(venueId, since, ["chef_pick_started"]),
    distinctSessions(venueId, since, ["chef_pick_completed"]),
    topItems(venueId, since, "menu_item_viewed"),
    topItems(venueId, since, "pick_saved"),
    db.guestEvent.count({
      where: { venueId, createdAt: { gte: since }, type: "pairing_saved" },
    }),
  ]);

  const [viewedNames, savedNames] = await Promise.all([
    nameItems(viewed),
    nameItems(saved),
  ]);

  return {
    explorationRate: rate(exploredSessions, sessions),
    specialEngagementRate: rate(specialSessions, sessions),
    specialsRevealed,
    chefPickCompletionRate: rate(chefCompleted, chefStarted),
    mostViewed: viewedNames,
    mostSaved: savedNames,
    savedAfterSuggestion,
  };
}

/**
 * How many distinct visits produced at least one of these events.
 *
 * groupBy over sessionId rather than a raw count: one guest opening
 * fifteen dishes is one exploring visit, not fifteen.
 */
async function distinctSessions(
  venueId: string,
  since: Date,
  types: string[],
): Promise<number> {
  const rows = await db.guestEvent.groupBy({
    by: ["sessionId"],
    where: {
      venueId,
      createdAt: { gte: since },
      type: { in: types },
      sessionId: { not: null },
    },
  });
  return rows.length;
}

async function topItems(
  venueId: string,
  since: Date,
  type: string,
): Promise<{ menuItemId: string; count: number }[]> {
  const rows = await db.guestEvent.groupBy({
    by: ["menuItemId"],
    where: {
      venueId,
      createdAt: { gte: since },
      type,
      menuItemId: { not: null },
    },
    _count: { _all: true },
  });
  return rows
    .map(r => ({ menuItemId: r.menuItemId!, count: r._count._all }))
    .sort((a, b) => b.count - a.count || a.menuItemId.localeCompare(b.menuItemId))
    .slice(0, 5);
}

/**
 * Resolve ids to names, dropping anything that no longer exists.
 *
 * Events deliberately outlive the dishes they reference — deleting an
 * item shouldn't erase the record of guests having looked at it — so a
 * chart has to cope with an id it can't name. Dropping is right here:
 * "(deleted item), 40 views" tells a manager nothing they can use.
 */
async function nameItems(
  rows: { menuItemId: string; count: number }[],
): Promise<{ menuItemId: string; name: string; count: number }[]> {
  if (rows.length === 0) return [];
  const items = await db.menuItem.findMany({
    where: { id: { in: rows.map(r => r.menuItemId) } },
    select: { id: true, name: true },
  });
  const names = new Map(items.map(i => [i.id, i.name]));
  return rows
    .filter(r => names.has(r.menuItemId))
    .map(r => ({ ...r, name: names.get(r.menuItemId)! }));
}
