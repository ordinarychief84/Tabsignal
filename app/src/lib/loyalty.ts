/**
 * Tier 3c: loyalty points helpers.
 *
 * Points are stored on `GuestProfile.loyaltyPointsByVenueId` as JSON
 * `{ [venueId]: number }`. Per-venue isolation is intentional — one
 * org's loyalty doesn't leak across orgs.
 *
 * Award math: 1 point per dollar paid. Redemption: POINTS_PER_DOLLAR
 * (default 20) → $1 of credit. 100 points = $5 by default.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export const POINTS_PER_DOLLAR = 20;

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

type PointsMap = Record<string, number>;

function asMap(value: unknown): PointsMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PointsMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
  }
  return out;
}

export async function awardPoints(
  tx: Tx,
  profileId: string,
  venueId: string,
  points: number,
): Promise<{ awarded: number; balance: number }> {
  if (points <= 0) {
    const profile = await tx.guestProfile.findUnique({
      where: { id: profileId },
      select: { loyaltyPointsByVenueId: true },
    });
    return { awarded: 0, balance: asMap(profile?.loyaltyPointsByVenueId)[venueId] ?? 0 };
  }
  const profile = await tx.guestProfile.findUnique({
    where: { id: profileId },
    select: { loyaltyPointsByVenueId: true },
  });
  if (!profile) return { awarded: 0, balance: 0 };
  const map = asMap(profile.loyaltyPointsByVenueId);
  map[venueId] = (map[venueId] ?? 0) + Math.floor(points);
  await tx.guestProfile.update({
    where: { id: profileId },
    data: { loyaltyPointsByVenueId: map as unknown as Prisma.InputJsonValue },
  });
  return { awarded: Math.floor(points), balance: map[venueId] };
}

export async function redeemPoints(
  tx: Tx,
  profileId: string,
  venueId: string,
  points: number,
): Promise<{ ok: true; redeemed: number; balance: number; discountCents: number } | { ok: false; reason: string }> {
  if (points <= 0) return { ok: false, reason: "INVALID_AMOUNT" };
  const profile = await tx.guestProfile.findUnique({
    where: { id: profileId },
    select: { loyaltyPointsByVenueId: true },
  });
  if (!profile) return { ok: false, reason: "PROFILE_NOT_FOUND" };
  const map = asMap(profile.loyaltyPointsByVenueId);
  const balance = map[venueId] ?? 0;
  if (balance < points) return { ok: false, reason: "INSUFFICIENT_BALANCE" };

  map[venueId] = balance - points;
  await tx.guestProfile.update({
    where: { id: profileId },
    data: { loyaltyPointsByVenueId: map as unknown as Prisma.InputJsonValue },
  });

  const discountCents = Math.floor((points / POINTS_PER_DOLLAR) * 100);
  return { ok: true, redeemed: points, balance: map[venueId], discountCents };
}

export async function pointsFor(
  tx: Tx,
  profileId: string,
  venueId: string,
): Promise<number> {
  const profile = await tx.guestProfile.findUnique({
    where: { id: profileId },
    select: { loyaltyPointsByVenueId: true },
  });
  return asMap(profile?.loyaltyPointsByVenueId)[venueId] ?? 0;
}

// Compute the points to award for a given total in cents. 1 point per
// whole dollar — partial dollars don't earn.
export function pointsForCents(totalCents: number): number {
  if (totalCents <= 0) return 0;
  return Math.floor(totalCents / 100);
}
