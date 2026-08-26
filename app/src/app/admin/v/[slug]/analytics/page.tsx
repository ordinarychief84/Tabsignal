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
import { guestExperienceMetrics, guestRelationshipMetrics, menuDiscoveryMetrics, type Rate } from "@/lib/guest-analytics";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · analytics" };

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

  // Guest experience + relationship, over the same window as the rest of
  // the page.
  const since = new Date(data.rangeStart);
  const [experience, relationship, discovery] = await Promise.all([
    guestExperienceMetrics(venue.id, since),
    guestRelationshipMetrics(venue.id, since),
    menuDiscoveryMetrics(venue.id, since),
  ]);

  return (
    <>
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Insights</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Analytics</h1>
          <p className="mt-2 text-sm text-slate/60">
            What&rsquo;s working, through {new Date(data.rangeEnd).toLocaleString()}.
          </p>
        </div>
        <a
          href={`/api/admin/v/${params.slug}/export/sessions?days=90`}
          className="shrink-0 rounded-full border border-slate/15 bg-white px-3 py-1.5 text-xs text-slate/70 hover:border-slate/40"
          title="Last 90 days of paid sessions, totals + tip + tax"
        >
          ↓ Export sessions CSV
        </a>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-umber">
          Guest experience
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Scans" value={String(experience.scans)} />
          <Metric
            label="Median response"
            value={experience.medianResponseSeconds === null ? "—" : formatWait(experience.medianResponseSeconds)}
            hint="From routed to acknowledged"
          />
          <Metric label="Service requests" value={String(experience.serviceRequests)} hint={experience.requestsPerScan === null ? undefined : `${experience.requestsPerScan} per scan`} />
          <Metric label="Recovery requests" value={String(experience.recoveryRequests)} hint="Guests who asked for a manager" />
          <RateMetric label="My Picks used" rate={experience.picksUsage} />
          <RateMetric label="Left feedback" rate={experience.feedbackRate} />
          <Metric
            label="Average rating"
            value={experience.averageRating === null ? "—" : `${experience.averageRating}/5`}
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-umber">
          Menu discovery
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RateMetric
            label="Looked at the menu"
            rate={discovery.explorationRate}
            hint="Of visits that scanned"
          />
          <RateMetric
            label="Engaged with a special"
            rate={discovery.specialEngagementRate}
            hint="Of visits that scanned"
          />
          <Metric label="Specials opened" value={String(discovery.specialsRevealed)} />
          <RateMetric
            label="Finished the chef's round"
            rate={discovery.chefPickCompletionRate}
            hint="Of those who saw it"
          />
        </div>

        {discovery.mostViewed.length > 0 || discovery.mostSaved.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ItemChart title="Most looked at" rows={discovery.mostViewed} />
            <ItemChart title="Most saved" rows={discovery.mostSaved} />
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-slate/50">
            Nothing yet for this period. These fill in as guests browse.
          </p>
        )}

        {discovery.savedAfterSuggestion > 0 ? (
          <p className="mt-3 text-[12px] leading-relaxed text-slate/50">
            {discovery.savedAfterSuggestion} saved after one of your
            &ldquo;goes well with&rdquo; suggestions. That&rsquo;s a count of
            saves, not sales — TabCall can&rsquo;t see your till.
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-umber">
          Guest relationship
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <RateMetric label="Left a phone number" rate={relationship.phoneCaptureRate} />
          <RateMetric label="Opted in to marketing" rate={relationship.marketingOptInRate} hint="Of guests who left a number" />
          <Metric label="Returning guests" value={String(relationship.returningGuests)} hint="More than one recorded visit" />
          <Metric label="Contacts" value={String(relationship.contacts)} />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-slate/50">
          Counts of what happened at this venue. TabCall doesn&rsquo;t process
          payments, so nothing here claims a revenue effect.
        </p>
      </section>

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
            Anonymized. Only segment medians are shown.
          </p>
          {benchmarks.rows.every(r => r.segment === null) ? (
            <p className="mt-4 rounded bg-slate/5 px-3 py-3 text-xs text-slate/55">
              Building your benchmark. Appears once 5+ Pro venues in your segment have a day of data.
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
                    title={`${h.hour}:00 · ${dollars(h.revenueCents)}`}
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

/** A plain count or value. */
/**
 * A small ranked bar list. Proportional to the top row rather than to a
 * fixed scale, because the useful question is "what stands out tonight",
 * not "how does this compare to an absolute number nobody set".
 *
 * Counts are printed next to every bar. A bar chart with no numbers
 * invites a manager to read a 3-vs-2 difference as significant.
 */
function ItemChart({
  title,
  rows,
}: {
  title: string;
  rows: { menuItemId: string; name: string; count: number }[];
}) {
  if (rows.length === 0) return null;
  const top = rows[0]!.count;
  return (
    <div className="rounded-2xl border border-umber-soft/30 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{title}</p>
      <ul className="mt-3 space-y-1.5">
        {rows.map(r => (
          <li key={r.menuItemId} className="relative overflow-hidden rounded-lg bg-oat px-3 py-2">
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-saffron/45"
              style={{ width: `${Math.round((r.count / top) * 100)}%` }}
            />
            <span className="relative flex items-center justify-between gap-3 text-[13px]">
              <span className="truncate text-slate">{r.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-slate/60">{r.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums text-slate">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate/50">{hint}</p> : null}
    </div>
  );
}

/**
 * A rate, shown WITH its numerator and denominator. "40%" from two out of
 * five is a different fact from two hundred out of five hundred, and an
 * owner deciding what to change needs to be able to tell them apart.
 */
function RateMetric({ label, rate, hint }: { label: string; rate: Rate; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-1 font-mono text-2xl tabular-nums text-slate">
        {rate.pct === null ? "—" : `${rate.pct}%`}
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-slate/50">
        {rate.count} of {rate.of}
      </p>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-slate/50">{hint}</p> : null}
    </div>
  );
}

function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}
