import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { venueAnalytics, type AnalyticsRange } from "@/lib/analytics";
import { dollars } from "@/lib/bill";
import { venuePlanForVenueId } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";
import { UpgradeRequired } from "../upgrade-required";

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
    select: { id: true },
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
