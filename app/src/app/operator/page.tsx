import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator, operatorAllowlist } from "@/lib/auth/operator";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — operator console" };

export default async function OperatorConsole() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator");
  if (!isOperator(session)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-oat px-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium text-slate">Operator only.</h1>
          <p className="mt-3 text-sm text-slate/60">
            This console is gated to TabCall&rsquo;s operator allowlist.
            You&rsquo;re signed in as <span className="font-mono text-[12px]">{session.email}</span>.
          </p>
          <p className="mt-3 text-[11px] text-slate/40">
            Allowlist size: {operatorAllowlist().length}
          </p>
          <Link
            href={`/admin`}
            className="mt-6 inline-block rounded-lg border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate hover:text-oat"
          >
            ← back to admin
          </Link>
        </div>
      </main>
    );
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [orgs, totalVenues, totalStaff, totalGuestsToday, totalRequestsToday, totalPaidToday, recentVenues] = await Promise.all([
    db.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        venues: {
          select: { id: true, slug: true, name: true, createdAt: true, posType: true, stripeAccountId: true },
        },
      },
      take: 100,
    }),
    db.venue.count(),
    db.staffMember.count(),
    db.guestSession.count({ where: { createdAt: { gte: since24h } } }),
    db.request.count({ where: { createdAt: { gte: since24h } } }),
    db.guestSession.count({ where: { paidAt: { gte: since24h } } }),
    db.venue.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { slug: true, name: true, createdAt: true, org: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-3xl font-medium tracking-tight">Operator console</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/operator/venues/new"
              className="rounded-full bg-slate px-4 py-1.5 text-xs text-oat hover:bg-slate/90"
            >
              + New venue
            </Link>
            <p className="text-[11px] tracking-wide text-slate/40">Past 24 hours</p>
          </div>
        </div>
        <p className="text-sm text-slate/60">
          Platform-wide view of TabCall. Use per-org pages to flip plans,
          manage members, and broadcast notices.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Orgs" value={String(orgs.length)} />
          <Stat label="Venues" value={String(totalVenues)} />
          <Stat label="Staff seats" value={String(totalStaff)} />
          <Stat label="Guests · 24h" value={String(totalGuestsToday)} hint={`${totalRequestsToday} requests`} />
          <Stat label="Paid · 24h" value={String(totalPaidToday)} hint="Settled tabs" />
        </div>

        <section className="mt-12">
          <header className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-medium">Recent venues</h2>
            <p className="text-[11px] tracking-wide text-slate/40">{recentVenues.length} most recent</p>
          </header>
          <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
            {recentVenues.map(v => (
              <li key={v.slug} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate">{v.name}</p>
                  <p className="truncate text-[11px] text-slate/50">
                    {v.org.name} · {timeAgo(v.createdAt)}
                  </p>
                </div>
                <Link
                  href={`/admin/v/${v.slug}`}
                  className="text-[12px] text-umber underline-offset-4 hover:underline"
                >
                  open ↗
                </Link>
              </li>
            ))}
            {recentVenues.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-slate/55">
                No venues yet.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="mt-12">
          <header className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-medium">All organizations</h2>
            <p className="text-[11px] tracking-wide text-slate/40">{orgs.length}</p>
          </header>
          {orgs.length === 0 ? (
            <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
              No organizations yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {orgs.map(o => (
                <li key={o.id} className="rounded-2xl border border-slate/10 bg-white">
                  <header className="flex items-center justify-between gap-4 border-b border-slate/5 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate">{o.name}</p>
                      <p className="truncate text-[11px] text-slate/45">
                        {o.plan.toLowerCase()} · created {timeAgo(o.createdAt)}
                      </p>
                    </div>
                    <p className="text-[11px] tracking-wide text-slate/40">
                      {o.venues.length} venue{o.venues.length === 1 ? "" : "s"}
                    </p>
                  </header>
                  {o.venues.length === 0 ? (
                    <p className="px-5 py-3 text-[12px] text-slate/45">No venues</p>
                  ) : (
                    <ul className="divide-y divide-slate/5">
                      {o.venues.map(v => (
                        <li
                          key={v.id}
                          className="flex items-center justify-between gap-4 px-5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate">{v.name}</p>
                            <p className="truncate font-mono text-[11px] text-slate/45">
                              {v.slug} · {v.posType.toLowerCase()}{v.stripeAccountId ? " · stripe" : ""}
                            </p>
                          </div>
                          <Link
                            href={`/admin/v/${v.slug}`}
                            className="text-[12px] text-umber underline-offset-4 hover:underline"
                          >
                            open ↗
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

      <p className="mt-12 text-[11px] tracking-wide text-slate/40">
        Operator allowlist · {operatorAllowlist().length} email
        {operatorAllowlist().length === 1 ? "" : "s"} · set via OPERATOR_EMAILS
      </p>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className="mt-2 font-mono text-3xl tabular-nums text-slate">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate/50">{hint}</p> : null}
    </div>
  );
}

function timeAgo(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
