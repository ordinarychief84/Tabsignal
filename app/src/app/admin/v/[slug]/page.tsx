import { db } from "@/lib/db";
import { ManagerFloor } from "./manager-floor";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — manager dashboard" };

export default async function ManagerDashboard({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, timezone: true },
  });
  if (!venue) return null;

  // Day window in venue's local timezone — fall back to UTC if Intl can't parse.
  const start = startOfTodayUTC(venue.timezone);

  const [served, pending, ackedToday, staffCount, recentResolved] = await Promise.all([
    db.request.count({
      where: { venueId: venue.id, status: "RESOLVED", createdAt: { gte: start } },
    }),
    db.request.count({
      where: { venueId: venue.id, status: "PENDING" },
    }),
    db.request.findMany({
      where: {
        venueId: venue.id,
        acknowledgedAt: { not: null },
        createdAt: { gte: start },
      },
      select: { createdAt: true, acknowledgedAt: true },
      take: 500,
    }),
    db.staffMember.count({ where: { venueId: venue.id } }),
    db.request.findMany({
      where: {
        venueId: venue.id,
        status: "RESOLVED",
        resolvedAt: { not: null },
      },
      orderBy: { resolvedAt: "desc" },
      take: 8,
      include: {
        table: { select: { label: true } },
        acknowledgedBy: { select: { name: true } },
      },
    }),
  ]);

  const avgAckSec = ackMedianSeconds(ackedToday);

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
          {venue.name}
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Live floor</h1>
        <p className="mt-1 text-sm text-slate/55">
          Today, in your timezone ({venue.timezone}).
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open requests" value={String(pending)} hint={pending === 0 ? "Floor is quiet" : "On the floor right now"} />
        <Stat label="Served today" value={String(served)} hint="Marked done" />
        <Stat label="Median ack" value={avgAckSec === null ? "—" : `${formatSec(avgAckSec)}`} hint="Time to first acknowledge" />
        <Stat label="Staff" value={String(staffCount)} hint="People on this venue" />
      </div>

      <section className="mt-10">
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium">Live</h2>
          <p className="text-[11px] tracking-wide text-slate/40">
            Updates instantly via WebSocket.
          </p>
        </header>
        <ManagerFloor venueId={venue.id} />
      </section>

      <section className="mt-12">
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium">Recently resolved</h2>
          <p className="text-[11px] tracking-wide text-slate/40">Last {recentResolved.length}</p>
        </header>
        {recentResolved.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-5 py-6 text-sm text-slate/55">
            Nothing resolved yet today.
          </div>
        ) : (
          <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
            {recentResolved.map(r => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  <span className="font-medium">{r.table.label}</span>
                  <span className="text-slate/55"> · {r.type.toLowerCase()}</span>
                </span>
                <span className="text-xs text-slate/45">
                  {r.acknowledgedBy?.name ?? "—"} · {timeAgo(r.resolvedAt!)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
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

function ackMedianSeconds(rows: { createdAt: Date; acknowledgedAt: Date | null }[]): number | null {
  const seconds: number[] = [];
  for (const r of rows) {
    if (!r.acknowledgedAt) continue;
    seconds.push((r.acknowledgedAt.getTime() - r.createdAt.getTime()) / 1000);
  }
  if (seconds.length === 0) return null;
  seconds.sort((a, b) => a - b);
  const mid = Math.floor(seconds.length / 2);
  return Math.round(seconds.length % 2 === 0 ? (seconds[mid - 1] + seconds[mid]) / 2 : seconds[mid]);
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startOfTodayUTC(timeZone: string): Date {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const ymd = fmt.format(now); // YYYY-MM-DD in target tz
    return new Date(`${ymd}T00:00:00Z`);
  } catch {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

function timeAgo(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
