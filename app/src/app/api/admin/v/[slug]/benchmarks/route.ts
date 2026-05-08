import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { METRICS, buildSegment, segmentKey, venueMetricsForDate } from "@/lib/benchmarks";

// Returns the venue's segment percentiles (latest snapshot in the past
// 7 days) alongside the venue's own most-recent daily values for the
// same metrics. UI can then render "you = 47k vs p50 = 38k".
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const venue = await db.venue.findUnique({
    where: { id: gate.venueId },
    select: { id: true, address: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const segment = buildSegment(venue);
  const key = segmentKey(segment);

  const since = new Date();
  since.setDate(since.getDate() - 7);
  since.setHours(0, 0, 0, 0);

  // For each metric, take the most-recent snapshot in the window.
  const snapshots = await db.benchmarkSnapshot.findMany({
    where: {
      segmentKey: key,
      metric: { in: METRICS },
      date: { gte: since },
    },
    orderBy: { date: "desc" },
  });

  const latestByMetric = new Map<string, typeof snapshots[number]>();
  for (const s of snapshots) {
    if (!latestByMetric.has(s.metric)) latestByMetric.set(s.metric, s);
  }

  // Venue's own values: for each metric, get yesterday's daily value
  // (so it's comparable to the snapshots, which are also daily).
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const myMetrics = await venueMetricsForDate(venue.id, yesterday);

  const rows = METRICS.map(m => {
    const snap = latestByMetric.get(m) ?? null;
    return {
      metric: m,
      mine: myMetrics[m],
      segment: snap
        ? {
            p25: snap.p25,
            p50: snap.p50,
            p75: snap.p75,
            p90: snap.p90,
            sampleCount: snap.sampleCount,
            date: snap.date.toISOString().slice(0, 10),
          }
        : null,
    };
  });

  return NextResponse.json({
    segment,
    benchmarks: rows,
  });
}
