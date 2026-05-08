import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { venueAnalytics, type AnalyticsRange } from "@/lib/analytics";
import { dollars } from "@/lib/bill";
import { venuePlanForVenueId } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";
import { UpgradeRequired } from "../upgrade-required";
import { METRICS, buildSegment, segmentKey, venueMetricsForDate, type MetricName } from "@/lib/benchmarks";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — analytics" };

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week",  label: "7 days" },
  { id: "month", label: "30 days" },
];

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { range?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/analytics`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, address: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const plan = await venuePlanForVenueId(venue.id);
  if (!meetsAtLeast(plan, "growth")) {
    return (
      <>
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Insights</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Analytics</h1>
        </header>
        <UpgradeRequired slug={params.slug} feature="Analytics" current={plan} required="growth" />
      </>
    );
  }

  const range: AnalyticsRange =
    searchParams.range === "month" ? "month" :
    searchParams.range === "today" ? "today" : "week";

  const data = await venueAnalytics(venue.id, range);

  const maxHourlyRevenue = Math.max(1, ...data.hourly.map(h => h.revenueCents));
  const maxRating = Math.max(1, ...Object.values(data.ratingsHistogram));

  // Tier 3d: benchmark comparison — only fetched on Pro. Hidden when no
  // segment data exists yet (early stages of the data product).
  const isPro = meetsAtLeast(plan, "pro");
  const benchmarks = isPro ? await loadBenchmarks(venue.id, venue.address) : null;

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Insights</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Analytics</h1>
        <p className="mt-2 text-sm text-slate/60">
          What&rsquo;s working — based on payment + rating data through {new Date(data.rangeEnd).toLocaleString()}.
        </p>
      </header>

      <nav className="mb-8 flex gap-2">
        {RANGES.map(r => (
          <Link
            key={r.id}
            href={`/admin/v/${params.slug}/analytics?range=${r.id}`}
            className={[
              "rounded-full px-4 py-1.5 text-sm",
              r.id === data.range
                ? "bg-slate text-oat"
                : "bg-slate/5 text-slate/70 hover:bg-slate/10",
            ].join(" ")}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Card label="Revenue" value={dollars(data.revenueCents)} />
        <Card label="Tickets" value={String(data.paidSessions)} />
        <Card label="Avg ticket" value={dollars(data.avgTicketCents)} />
        <Card label="Tips" value={dollars(data.tipsCents)} />
      </section>

      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white p-5">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">Ratings</h2>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-medium">
              {data.averageRating !== null ? data.averageRating.toFixed(2) : "—"}
            </span>
            <span className="text-xs text-slate/50">{data.ratingCount} ratings</span>
          </div>
          <ul className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map(stars => {
              const count = data.ratingsHistogram[stars as 1 | 2 | 3 | 4 | 5];
              const pct = (count / maxRating) * 100;
              return (
                <li key={stars} className="flex items-center gap-3 text-xs">
                  <span className="w-4 text-slate/60">{stars}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate/5">
                    <div
                      className={stars >= 4 ? "h-full bg-slate" : "h-full bg-coral/70"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums text-slate/60">{count}</span>
                </li>
              );
            })}
          </ul>
          {data.badRatingsOpen > 0 ? (
            <p className="mt-4 rounded bg-coral/5 px-3 py-2 text-xs text-coral">
              {data.badRatingsOpen} bad rating{data.badRatingsOpen === 1 ? "" : "s"} need{data.badRatingsOpen === 1 ? "s" : ""} review.{" "}
              <Link href={`/admin/v/${params.slug}/reviews`} className="underline">
                Open reviews →
              </Link>
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate/10 bg-white p-5">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">Top staff (acks)</h2>
          {data.topStaff.length === 0 ? (
            <p className="mt-3 text-xs text-slate/50">No acked requests in this window.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.topStaff.map(s => (
                <li key={s.staffId} className="flex items-center justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-slate/60">{s.ackedCount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {benchmarks ? (
        <section className="mb-8 rounded-2xl border border-slate/10 bg-white p-5">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">How you compare</h2>
          <p className="mt-1 text-xs text-slate/55">
            Yesterday vs other {benchmarks.segment.venueType}s in {benchmarks.segment.city}.
            Anonymized — only segment medians are shown.
          </p>
          {benchmarks.rows.every(r => r.segment === null) ? (
            <p className="mt-4 rounded bg-slate/5 px-3 py-3 text-xs text-slate/55">
              Building your benchmark — appears once 5+ Pro venues in your segment have a day of data.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {benchmarks.rows.map(r => (
                <BenchmarkRow key={r.metric} row={r} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate/10 bg-white p-5">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">By hour of day</h2>
        <p className="text-xs text-slate/50">Revenue per hour bucket (server local time).</p>
        <ul className="mt-4 grid grid-cols-12 gap-1 sm:grid-cols-24">
          {data.hourly.map(h => {
            const heightPct = (h.revenueCents / maxHourlyRevenue) * 100;
            return (
              <li key={h.hour} className="flex flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end">
                  <div
                    className="w-full rounded-t bg-slate"
                    style={{ height: `${heightPct}%` }}
                    title={`${h.hour}:00 — ${dollars(h.revenueCents)}`}
                  />
                </div>
                <span className="text-[9px] text-slate/40">{h.hour}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight">{value}</p>
    </div>
  );
}

type BenchmarkRowData = {
  metric: MetricName;
  mine: number;
  segment: { p25: number; p50: number; p75: number; p90: number; sampleCount: number; date: string } | null;
};

async function loadBenchmarks(venueId: string, address: string | null): Promise<{
  segment: ReturnType<typeof buildSegment>;
  rows: BenchmarkRowData[];
} | null> {
  const segment = buildSegment({ address });
  const key = segmentKey(segment);
  const since = new Date();
  since.setDate(since.getDate() - 7);
  since.setHours(0, 0, 0, 0);

  const snapshots = await db.benchmarkSnapshot.findMany({
    where: { segmentKey: key, date: { gte: since }, metric: { in: METRICS } },
    orderBy: { date: "desc" },
  });
  const latest = new Map<string, typeof snapshots[number]>();
  for (const s of snapshots) {
    if (!latest.has(s.metric)) latest.set(s.metric, s);
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const myMetrics = await venueMetricsForDate(venueId, yesterday);

  const rows: BenchmarkRowData[] = METRICS.map(m => {
    const snap = latest.get(m);
    return {
      metric: m,
      mine: myMetrics[m],
      segment: snap
        ? { p25: snap.p25, p50: snap.p50, p75: snap.p75, p90: snap.p90, sampleCount: snap.sampleCount, date: snap.date.toISOString().slice(0, 10) }
        : null,
    };
  });
  return { segment, rows };
}

function metricLabel(m: MetricName): string {
  switch (m) {
    case "revenueCents":   return "Revenue";
    case "tickets":        return "Tickets";
    case "avgTicketCents": return "Avg ticket";
    case "tipsCents":      return "Tips";
    case "avgRating":      return "Avg rating";
  }
}

function formatMetric(m: MetricName, value: number): string {
  if (m === "tickets") return String(Math.round(value));
  if (m === "avgRating") return value > 0 ? value.toFixed(2) : "—";
  return dollars(Math.round(value));
}

function BenchmarkRow({ row }: { row: BenchmarkRowData }) {
  if (!row.segment) {
    return (
      <li className="flex items-center justify-between text-sm">
        <span>{metricLabel(row.metric)}</span>
        <span className="font-mono text-xs text-slate/45">{formatMetric(row.metric, row.mine)} · no peer data</span>
      </li>
    );
  }
  // Position the venue's value within p25..p90; clamp.
  const lo = row.segment.p25;
  const hi = Math.max(row.segment.p90, lo + 1);
  const pct = Math.max(0, Math.min(100, ((row.mine - lo) / (hi - lo)) * 100));
  return (
    <li>
      <div className="flex items-center justify-between text-sm">
        <span>{metricLabel(row.metric)}</span>
        <span className="font-mono text-xs tabular-nums text-slate/70">
          you {formatMetric(row.metric, row.mine)} · p50 {formatMetric(row.metric, row.segment.p50)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-slate/5">
        <div
          className="h-full rounded-full bg-slate"
          style={{ width: `${pct}%` }}
          title={`p25 ${formatMetric(row.metric, row.segment.p25)} · p90 ${formatMetric(row.metric, row.segment.p90)} · n=${row.segment.sampleCount}`}
        />
      </div>
    </li>
  );
}
