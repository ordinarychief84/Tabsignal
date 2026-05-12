/**
 * Tier 3b: reservation logic — conflict detection + simple rate limit.
 *
 * Conflict detection is the meat: don't double-book a specific table
 * across overlapping windows, and don't accept a non-table booking that
 * would push an already-busy zone beyond capacity.
 */

import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";

export type ConflictReason =
  | { ok: true }
  | { ok: false; reason: "TABLE_DOUBLE_BOOKED" }
  | { ok: false; reason: "ZONE_AT_CAPACITY"; partyTotalAtPeak: number; capacity: number }
  | { ok: false; reason: "RATE_LIMIT" }
  | { ok: false; reason: "PAST_WINDOW" };

const RATE_LIMIT_PER_PHONE_PER_HOUR = 3;

/**
 * Reservation rate limiter. Backed by Upstash via rateLimitAsync so the
 * 3-per-hour window holds across Vercel cold starts. The previous
 * in-memory Map was per-lambda — useless under serverless. Falls
 * back to in-memory in dev / fails closed in prod when Upstash is
 * absent (see lib/rate-limit.ts).
 */
export async function rateCheck(slug: string, phone: string): Promise<boolean> {
  const result = await rateLimitAsync(`reservation:${slug}:${phone}`, {
    windowMs: 60 * 60 * 1000,
    max: RATE_LIMIT_PER_PHONE_PER_HOUR,
  });
  return result.ok;
}

// Check if a proposed reservation conflicts with existing ones.
// `tableId` may be null (zone-level booking).
export async function checkConflict(args: {
  venueId: string;
  tableId: string | null;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  // Pass-through capacity hint. If null we default to a soft 50-seat ceiling.
  zoneCapacity?: number;
}): Promise<ConflictReason> {
  if (args.startsAt.getTime() < Date.now()) {
    return { ok: false, reason: "PAST_WINDOW" };
  }

  if (args.tableId) {
    // Specific-table booking: refuse if any active reservation on that
    // table overlaps. Two intervals overlap iff a.start < b.end && b.start < a.end.
    const overlap = await db.reservation.findFirst({
      where: {
        tableId: args.tableId,
        status: { in: ["PENDING", "ARRIVED", "SEATED"] },
        startsAt: { lt: args.endsAt },
        endsAt: { gt: args.startsAt },
      },
      select: { id: true },
    });
    if (overlap) return { ok: false, reason: "TABLE_DOUBLE_BOOKED" };
    return { ok: true };
  }

  // Zone-level booking: sum partySize across overlapping bookings (any
  // table or no table). If the sum exceeds capacity, refuse.
  const overlapping = await db.reservation.findMany({
    where: {
      venueId: args.venueId,
      status: { in: ["PENDING", "ARRIVED", "SEATED"] },
      startsAt: { lt: args.endsAt },
      endsAt: { gt: args.startsAt },
    },
    select: { partySize: true },
  });
  const partyTotalAtPeak = overlapping.reduce((s, r) => s + r.partySize, args.partySize);
  const capacity = args.zoneCapacity ?? 50;
  if (partyTotalAtPeak > capacity) {
    return { ok: false, reason: "ZONE_AT_CAPACITY", partyTotalAtPeak, capacity };
  }
  return { ok: true };
}

// Quote a wait-time for the waitlist based on FIFO position. 15 min per
// party-of-up-to-4 ahead of you is a soft heuristic.
export function quoteWait(positionsAhead: number, partySize: number): number {
  const base = positionsAhead * 15;
  const adj = partySize >= 5 ? 10 : 0;
  return Math.max(5, base + adj);
}
