import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess } from "@/lib/operator-rbac";
import { venueAnalytics, type AnalyticsRange } from "@/lib/analytics";
import { dollars } from "@/lib/bill";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · org overview" };

const RANGES: { id: AnalyticsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week",  label: "7 days" },
  { id: "month", label: "30 days" },
];

export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: { orgId: string };
  searchParams: { range?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/operator/orgs/${params.orgId}`);
  const access = await checkOrgAccess(session, params.orgId);
  if (!access.ok) redirect(`/operator`);

  const range: AnalyticsRange =
    searchParams.range === "today" ? "today" : searchParams.range === "month" ? "month" : "week";

  const [org, venues] = await Promise.all([
    db.organization.findUnique({
      where: { id: params.orgId },
      select: { name: true, plan: true, subscriptionStatus: true },
    }),
    db.venue.findMany({
      where: { orgId: params.orgId },
      select: { id: true, slug: true, name: true, regionTag: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!org) redirect("/operator");

  const perVenue = await Promise.all(
    venues.map(async v => {
      const a = await venueAnalytics(v.id, range);
      return {
        ...v,
        revenueCents: a.revenueCents,
        paidSessions: a.paidSessions,
        avgTicketCents: a.avgTicketCents,
        averageRating: a.averageRating,
        badRatingsOpen: a.badRatingsOpen,
      };
    })
  );

  const totals = perVenue.reduce(
    (acc, v) => ({
      revenueCents: acc.revenueCents + v.revenueCents,
      paidSessions: acc.paidSessions + v.paidSessions,
      badRatingsOpen: acc.badRatingsOpen + v.badRatingsOpen,
    }),
    { revenueCents: 0, paidSessions: 0, badRatingsOpen: 0 }
  );

  const ranked = [...perVenue].sort((a, b) => b.revenueCents - a.revenueCents);
  const top = ranked.slice(0, 3);
  const lagging = ranked.filter(v => v.paidSessions > 0).slice(-3).reverse();

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Overview</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">{org.name}</h1>
        <p className="mt-2 text-sm text-slate/60">
          Plan: {org.plan.toLowerCase()} · {venues.length} venue{venues.length === 1 ? "" : "s"} · subscription {org.subscriptionStatus.toLowerCase()}
        </p>
      </header>

      <nav className="mb-8 flex gap-2">
        {RANGES.map(r => (
          <Link
            key={r.id}
            href={`/operator/orgs/${params.orgId}?range=${r.id}`}
            className={[
              "rounded-full px-4 py-1.5 text-sm",
              r.id === range
                ? "bg-slate text-oat"
                : "bg-slate/5 text-slate/70 hover:bg-slate/10",
            ].join(" ")}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Revenue" value={dollars(totals.revenueCents)} />
        <Stat label="Tickets" value={String(totals.paidSessions)} />
        <Stat label="Bad ratings open" value={String(totals.badRatingsOpen)} tone={totals.badRatingsOpen > 0 ? "warn" : "neutral"} />
      </section>

      <section className="mb-8 grid gap-6 md:grid-cols-2">
        <RankList title="Top venues" rows={top} />
        <RankList title="Lagging venues" rows={lagging} empty="No paid traffic in this window" />
      </section>

      <p className="text-[11px] tracking-wide text-slate/40">
        Read-only view. Actions like onboarding new venues happen in admin or via DB.
      </p>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "neutral" }) {
  return (
    <div className={[
      "rounded-2xl border p-4",
      tone === "warn" ? "border-coral/40 bg-coral/5" : "border-slate/10 bg-white",
    ].join(" ")}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-1 text-2xl font-medium tracking-tight">{value}</p>
    </div>
  );
}

function RankList({
  title,
  rows,
  empty = "No data.",
}: {
  title: string;
  rows: Array<{ slug: string; name: string; revenueCents: number; paidSessions: number }>;
  empty?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-5">
      <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate/50">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(v => (
            <li key={v.slug} className="flex items-center justify-between text-sm">
              <Link href={`/admin/v/${v.slug}`} className="hover:underline">{v.name}</Link>
              <span className="font-mono text-xs tabular-nums text-slate/60">
                {dollars(v.revenueCents)} · {v.paidSessions}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
