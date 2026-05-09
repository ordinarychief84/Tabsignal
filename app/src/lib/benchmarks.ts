/**
 * Tier 3d: industry benchmarking aggregation.
 *
 * Per-segment percentiles computed nightly from anonymized venue data.
 * Hard k-anonymity rule: never emit a row with sampleCount < 5.
 *
 * Privacy: outputs only percentiles per segment — never individual venue
 * data. Antitrust is the silent killer of features like this; segment
 * medians are safe to expose, raw competitor numbers are not.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor } from "@/lib/bill";

export const K_ANONYMITY = 5;

export type Segment = {
  city: string;
  venueType: string;
  capacityBucket: "lt20" | "20to50" | "50to100" | "gte100";
};

export type MetricName = "revenueCents" | "tickets" | "avgTicketCents" | "tipsCents" | "avgRating";

export const METRICS: MetricName[] = [
  "revenueCents",
  "tickets",
  "avgTicketCents",
  "tipsCents",
  "avgRating",
];

export function segmentKey(seg: Segment): string {
  // Sort keys for stability — JSON.stringify alone isn't enough because
  // key order isn't guaranteed across runtimes.
  const keys = Object.keys(seg).sort() as Array<keyof Segment>;
  const canonical = keys.map(k => `${k}:${seg[k]}`).join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

// City heuristic — extract trailing token after the last comma. If we
// can't parse, segment as "unknown" so the venue still gets aggregated.
export function deriveCity(address: string | null): string {
  if (!address) return "unknown";
  const parts = address.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return "unknown";
  const candidate = parts[parts.length - 2] ?? parts[parts.length - 1];
  return candidate.toLowerCase().slice(0, 32);
}

// Capacity is not a column on Venue today; bucket is "unknown" until we
// add one. We still bucket cleanly so future data slots in.
export function deriveCapacityBucket(): Segment["capacityBucket"] {
  return "20to50";
}

export function deriveVenueType(): string {
  // Venue.type doesn't exist yet; default to "bar" until we add it.
  return "bar";
}

export function buildSegment(venue: {
  address: string | null;
}): Segment {
  return {
    city: deriveCity(venue.address),
    venueType: deriveVenueType(),
    capacityBucket: deriveCapacityBucket(),
  };
}

// Per-venue metrics for one calendar day. Pulls paid sessions and
// feedback, computes the per-venue values that get aggregated upstream.
export async function venueMetricsForDate(venueId: string, date: Date): Promise<Record<MetricName, number>> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { zipCode: true },
  });

  const sessions = await db.guestSession.findMany({
    where: { venueId, paidAt: { gte: start, lt: end } },
    select: { lineItems: true, tipPercent: true },
  });
  const ratings = await db.feedbackReport.findMany({
    where: { venueId, createdAt: { gte: start, lt: end } },
    select: { rating: true },
  });

  let revenueCents = 0;
  let tipsCents = 0;
  for (const s of sessions) {
    const t = totalsFor(
      parseLineItems(s.lineItems),
      venue?.zipCode ?? "",
      typeof s.tipPercent === "number" ? s.tipPercent : 0,
    );
    revenueCents += t.totalCents;
    tipsCents += t.tipCents;
  }
  const tickets = sessions.length;
  const avgTicketCents = tickets > 0 ? Math.round(revenueCents / tickets) : 0;
  const avgRating = ratings.length > 0
    ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
    : 0;

  return { revenueCents, tickets, avgTicketCents, tipsCents, avgRating };
}

// Compute percentiles across a sorted sample. Linear interpolation.
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// One-shot aggregator: for a given date, compute per-venue metrics for
// every venue, group by segment, write a BenchmarkSnapshot row per
// (segment, metric) that has at least K_ANONYMITY samples.
export async function aggregateForDate(date: Date): Promise<{ snapshotsWritten: number; segmentsConsidered: number }> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const venues = await db.venue.findMany({
    select: { id: true, address: true },
  });

  // venueMetrics[segmentKey][metric] = array of values across venues
  const bySegment = new Map<string, { segment: Segment; values: Record<MetricName, number[]> }>();

  for (const v of venues) {
    const seg = buildSegment(v);
    const key = segmentKey(seg);
    const metrics = await venueMetricsForDate(v.id, dayStart);
    const bucket = bySegment.get(key) ?? {
      segment: seg,
      values: { revenueCents: [], tickets: [], avgTicketCents: [], tipsCents: [], avgRating: [] },
    };
    for (const m of METRICS) bucket.values[m].push(metrics[m]);
    bySegment.set(key, bucket);
  }

  let snapshotsWritten = 0;
  for (const [key, bucket] of bySegment) {
    for (const metric of METRICS) {
      const vals = [...bucket.values[metric]].sort((a, b) => a - b);
      // Drop zeros only for ratings (zero = "no rating that day", noise).
      // Other metrics: a zero is a real "had no business" signal worth keeping.
      const sample = metric === "avgRating" ? vals.filter(v => v > 0) : vals;
      if (sample.length < K_ANONYMITY) continue;

      await db.benchmarkSnapshot.upsert({
        where: {
          date_metric_segmentKey: {
            date: dayStart,
            metric,
            segmentKey: key,
          },
        },
        update: {
          p25: percentile(sample, 0.25),
          p50: percentile(sample, 0.5),
          p75: percentile(sample, 0.75),
          p90: percentile(sample, 0.9),
          sampleCount: sample.length,
          segmentJson: bucket.segment as unknown as Prisma.InputJsonValue,
        },
        create: {
          date: dayStart,
          metric,
          segmentKey: key,
          segmentJson: bucket.segment as unknown as Prisma.InputJsonValue,
          p25: percentile(sample, 0.25),
          p50: percentile(sample, 0.5),
          p75: percentile(sample, 0.75),
          p90: percentile(sample, 0.9),
          sampleCount: sample.length,
        },
      });
      snapshotsWritten += 1;
    }
  }

  return { snapshotsWritten, segmentsConsidered: bySegment.size };
}
