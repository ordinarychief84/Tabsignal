/**
 * Tier 3e: regulars dossier — the differentiated wedge.
 *
 * Every paid session paired to a GuestProfile becomes part of the regular's
 * record at this venue. The dossier is what the bartender sees when a
 * paired guest sits down: "Sarah, 38 visits, Negroni 7/8, peanut allergy,
 * last drink came late and she gave 2★."
 *
 * Per-venue isolation is intentional: a regular's note at Bar A doesn't
 * leak to Bar B even if the phone is the same.
 */

import { db } from "@/lib/db";
import { parseLineItems } from "@/lib/bill";

type LineItem = { name: string; quantity: number; unitCents: number };

export type RegularScore = {
  // 0-100. Heuristic score; not a credit-bureau number.
  score: number;
  visits: number;
  recencyDays: number | null;
  spendCents: number;
  avgTipPercent: number | null;
};

export type Dossier = {
  profile: {
    id: string;
    phone: string;
    displayName: string | null;
    preferences: unknown;
  };
  score: RegularScore;
  topItems: Array<{ name: string; count: number }>;
  recentVisits: Array<{
    sessionId: string;
    paidAt: string;
    spendCents: number;
    tipPercent: number | null;
    rating: number | null;
    feedback: string | null;
  }>;
  notes: Array<{
    id: string;
    authorName: string;
    body: string;
    pinned: boolean;
    createdAt: string;
  }>;
  // Cumulative loyalty points at this venue (sourced from
  // GuestProfile.loyaltyPointsByVenueId for convenience here).
  loyaltyPoints: number;
};

const VISIT_WEIGHT = 0.35;
const RECENCY_WEIGHT = 0.30;
const SPEND_WEIGHT = 0.25;
const TIP_WEIGHT = 0.10;

// Tunable: a regular is "active" within ~60 days. After that recency tapers.
const RECENCY_HALFLIFE_DAYS = 60;
const VISIT_PEAK = 30; // 30+ visits saturates the visit dimension.
const SPEND_PEAK_CENTS = 200_000; // $2,000 lifetime saturates spend.

export function computeScore(args: {
  visits: number;
  recencyDays: number | null;
  spendCents: number;
  avgTipPercent: number | null;
}): number {
  const visitN = Math.min(1, args.visits / VISIT_PEAK);
  const recencyN = args.recencyDays === null
    ? 0
    : Math.pow(0.5, args.recencyDays / RECENCY_HALFLIFE_DAYS);
  const spendN = Math.min(1, args.spendCents / SPEND_PEAK_CENTS);
  // 18-22% is normal; 25%+ is generous. Map to 0..1 with cap at 25%.
  const tipN = args.avgTipPercent === null ? 0.5 : Math.max(0, Math.min(1, args.avgTipPercent / 25));
  const raw = visitN * VISIT_WEIGHT
            + recencyN * RECENCY_WEIGHT
            + spendN * SPEND_WEIGHT
            + tipN * TIP_WEIGHT;
  return Math.round(raw * 100);
}

export async function dossierFor(profileId: string, venueId: string): Promise<Dossier | null> {
  const [profile, sessions, notes] = await Promise.all([
    db.guestProfile.findUnique({
      where: { id: profileId },
      select: { id: true, phone: true, displayName: true, preferences: true, loyaltyPointsByVenueId: true },
    }),
    db.guestSession.findMany({
      where: { guestProfileId: profileId, venueId, paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        paidAt: true,
        tipPercent: true,
        lineItems: true,
        feedback: { select: { rating: true, note: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 30,
    }),
    db.guestNote.findMany({
      where: { guestProfileId: profileId, venueId, deletedAt: null },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
  ]);
  if (!profile) return null;

  let spendCents = 0;
  const itemCounts = new Map<string, number>();
  let tipSum = 0;
  let tipN = 0;
  for (const s of sessions) {
    const items = parseLineItems(s.lineItems) as LineItem[];
    for (const it of items) {
      spendCents += (it.quantity ?? 1) * (it.unitCents ?? 0);
      const name = (it.name ?? "").trim();
      if (name && (it.unitCents ?? 0) > 0) {
        itemCounts.set(name, (itemCounts.get(name) ?? 0) + (it.quantity ?? 1));
      }
    }
    if (typeof s.tipPercent === "number") {
      tipSum += s.tipPercent;
      tipN += 1;
    }
  }

  const topItems = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const recencyDays = sessions[0]?.paidAt
    ? Math.floor((Date.now() - sessions[0].paidAt.getTime()) / 86_400_000)
    : null;

  const avgTipPercent = tipN > 0 ? tipSum / tipN : null;
  const score = computeScore({
    visits: sessions.length,
    recencyDays,
    spendCents,
    avgTipPercent,
  });

  const points = pointsFromMap(profile.loyaltyPointsByVenueId, venueId);

  return {
    profile: {
      id: profile.id,
      phone: profile.phone,
      displayName: profile.displayName,
      preferences: profile.preferences,
    },
    score: { score, visits: sessions.length, recencyDays, spendCents, avgTipPercent },
    topItems,
    recentVisits: sessions.slice(0, 8).map(s => ({
      sessionId: s.id,
      paidAt: s.paidAt!.toISOString(),
      spendCents: spendForSession(s.lineItems),
      tipPercent: s.tipPercent ?? null,
      rating: s.feedback[0]?.rating ?? null,
      feedback: s.feedback[0]?.note ?? null,
    })),
    notes: notes.map(n => ({
      id: n.id,
      authorName: n.authorName,
      body: n.body,
      pinned: n.pinned,
      createdAt: n.createdAt.toISOString(),
    })),
    loyaltyPoints: points,
  };
}

function spendForSession(lineItems: unknown): number {
  const items = parseLineItems(lineItems) as LineItem[];
  return items.reduce((s, it) => s + (it.quantity ?? 1) * (it.unitCents ?? 0), 0);
}

function pointsFromMap(value: unknown, venueId: string): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const v = (value as Record<string, unknown>)[venueId];
  return typeof v === "number" && v >= 0 ? Math.floor(v) : 0;
}

// Compact preview struct used in the realtime "regular_arrived" emit.
// Fits on the bartender's PWA banner without scroll.
export type RegularPreview = {
  profileId: string;
  displayName: string | null;
  score: number;
  visits: number;
  recencyDays: number | null;
  topItem: string | null;
  pinnedNote: string | null;
  loyaltyPoints: number;
};

export async function previewFor(profileId: string, venueId: string): Promise<RegularPreview | null> {
  const dossier = await dossierFor(profileId, venueId);
  if (!dossier) return null;
  return {
    profileId: dossier.profile.id,
    displayName: dossier.profile.displayName,
    score: dossier.score.score,
    visits: dossier.score.visits,
    recencyDays: dossier.score.recencyDays,
    topItem: dossier.topItems[0]?.name ?? null,
    pinnedNote: dossier.notes.find(n => n.pinned)?.body ?? dossier.notes[0]?.body ?? null,
    loyaltyPoints: dossier.loyaltyPoints,
  };
}

// Bulk list for the regulars admin page. Returns top regulars by score.
export async function listRegulars(venueId: string, limit = 50): Promise<Array<{
  profileId: string;
  displayName: string | null;
  phone: string;
  visits: number;
  spendCents: number;
  recencyDays: number | null;
  score: number;
}>> {
  // Find guest profiles that have at least one paid session at this venue.
  // Heavy aggregation done in app code (Prisma's groupBy doesn't compose
  // well with the JSON line items we sum from). 50 regulars * lookup is
  // fine for now; switch to a materialized view if it gets slow.
  const sessions = await db.guestSession.findMany({
    where: { venueId, paidAt: { not: null }, guestProfileId: { not: null } },
    orderBy: { paidAt: "desc" },
    select: {
      guestProfileId: true,
      paidAt: true,
      tipPercent: true,
      lineItems: true,
    },
    take: 5000, // Hard cap so a viral venue doesn't OOM the page.
  });

  type Bucket = { visits: number; spend: number; tipSum: number; tipN: number; mostRecent: Date };
  const byProfile = new Map<string, Bucket>();
  for (const s of sessions) {
    if (!s.guestProfileId) continue;
    const existing = byProfile.get(s.guestProfileId) ?? { visits: 0, spend: 0, tipSum: 0, tipN: 0, mostRecent: new Date(0) };
    existing.visits += 1;
    existing.spend += spendForSession(s.lineItems);
    if (typeof s.tipPercent === "number") {
      existing.tipSum += s.tipPercent;
      existing.tipN += 1;
    }
    if (s.paidAt && s.paidAt > existing.mostRecent) existing.mostRecent = s.paidAt;
    byProfile.set(s.guestProfileId, existing);
  }

  if (byProfile.size === 0) return [];

  const profiles = await db.guestProfile.findMany({
    where: { id: { in: [...byProfile.keys()] } },
    select: { id: true, phone: true, displayName: true },
  });

  const rows = profiles.map(p => {
    const b = byProfile.get(p.id)!;
    const recencyDays = b.mostRecent.getTime() === 0
      ? null
      : Math.floor((Date.now() - b.mostRecent.getTime()) / 86_400_000);
    const avgTip = b.tipN > 0 ? b.tipSum / b.tipN : null;
    const score = computeScore({
      visits: b.visits,
      recencyDays,
      spendCents: b.spend,
      avgTipPercent: avgTip,
    });
    return {
      profileId: p.id,
      displayName: p.displayName,
      phone: p.phone,
      visits: b.visits,
      spendCents: b.spend,
      recencyDays,
      score,
    };
  });

  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}
