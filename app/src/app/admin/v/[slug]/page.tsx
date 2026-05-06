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

  const [served, pending, ackedToday, staffCount, recentResolved, todayRequestsByTable] = await Promise.all([
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
    // Per-table activity for the response-time heatmap. Pulls today's
    // requests with table label and acknowledgedAt so we can compute
    // median ack time per table in JS.
    db.request.findMany({
      where: { venueId: venue.id, createdAt: { gte: start } },
      select: {
        tableId: true,
        createdAt: true,
        acknowledgedAt: true,
        status: true,
        table: { select: { label: true } },
      },
      take: 1000,
    }),
  ]);

  const avgAckSec = ackMedianSeconds(ackedToday);
  const tableActivity = aggregateByTable(todayRequestsByTable);

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
          <h2 className="text-lg font-medium">Tables, by response time</h2>
          <p className="text-[11px] tracking-wide text-slate/40">
            Slowest first · today
          </p>
        </header>
        {tableActivity.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-5 py-6 text-sm text-slate/55">
            No table activity yet today. The heatmap fills as requests come in.
          </div>
        ) : (
          <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
            {tableActivity.map(t => {
              const slow = t.medianAckSec !== null && t.medianAckSec > 60;
              const delayed = t.delayedShare > 0.25;
              const stuck = t.openCount > 0 && t.medianAckSec === null && t.totalRequests > 0;
              const accent = stuck || delayed
                ? "border-l-coral"
                : slow
                ? "border-l-sea"
                : "border-l-transparent";
              return (
                <li
                  key={t.tableId}
                  className={[
                    "grid grid-cols-[1fr,auto,auto,auto] items-center gap-4 border-l-4 px-5 py-3 text-sm",
                    accent,
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate">{t.label}</p>
                    <p className="text-[11px] text-slate/55">
                      {t.totalRequests} request{t.totalRequests === 1 ? "" : "s"}
                      {t.openCount > 0 ? ` · ${t.openCount} open` : ""}
                    </p>
                  </div>
                  <Cell label="Median ack" value={t.medianAckSec === null ? "—" : formatSec(t.medianAckSec)} bad={slow} />
                  <Cell label="Delayed" value={`${Math.round(t.delayedShare * 100)}%`} bad={delayed} />
                  <Cell label="Last" value={timeAgo(t.lastAt)} />
                </li>
              );
            })}
          </ul>
        )}
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

function Cell({ label, value, bad = false }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="text-right">
      <p className={["font-mono text-sm tabular-nums", bad ? "text-coral" : "text-slate"].join(" ")}>{value}</p>
      <p className="text-[10px] tracking-wide text-slate/40">{label}</p>
    </div>
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

type TableActivity = {
  tableId: string;
  label: string;
  totalRequests: number;
  openCount: number;
  medianAckSec: number | null;
  delayedShare: number;
  lastAt: Date;
};

function aggregateByTable(rows: {
  tableId: string;
  createdAt: Date;
  acknowledgedAt: Date | null;
  status: string;
  table: { label: string };
}[]): TableActivity[] {
  const buckets = new Map<string, {
    label: string;
    total: number;
    open: number;
    delayed: number;
    ackSecs: number[];
    lastAt: Date;
  }>();

  for (const r of rows) {
    const b = buckets.get(r.tableId) ?? {
      label: r.table.label,
      total: 0,
      open: 0,
      delayed: 0,
      ackSecs: [] as number[],
      lastAt: r.createdAt,
    };
    b.total += 1;
    if (r.status === "PENDING" || r.status === "ACKNOWLEDGED") b.open += 1;
    if (r.acknowledgedAt) {
      const s = (r.acknowledgedAt.getTime() - r.createdAt.getTime()) / 1000;
      b.ackSecs.push(s);
      if (s > 180) b.delayed += 1;
    }
    if (r.createdAt > b.lastAt) b.lastAt = r.createdAt;
    buckets.set(r.tableId, b);
  }

  const out: TableActivity[] = [];
  for (const [tableId, b] of buckets) {
    let medianAckSec: number | null = null;
    if (b.ackSecs.length > 0) {
      const s = [...b.ackSecs].sort((a, c) => a - c);
      const mid = Math.floor(s.length / 2);
      medianAckSec = Math.round(s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]);
    }
    out.push({
      tableId,
      label: b.label,
      totalRequests: b.total,
      openCount: b.open,
      medianAckSec,
      delayedShare: b.total > 0 ? b.delayed / b.total : 0,
      lastAt: b.lastAt,
    });
  }

  // Slowest first: tables with no ack data but open requests rank as worst
  // ("ignored"); then by median ack desc; ties broken by total volume.
  return out.sort((a, b) => {
    const aStuck = a.openCount > 0 && a.medianAckSec === null;
    const bStuck = b.openCount > 0 && b.medianAckSec === null;
    if (aStuck && !bStuck) return -1;
    if (!aStuck && bStuck) return 1;
    const aVal = a.medianAckSec ?? -1;
    const bVal = b.medianAckSec ?? -1;
    if (aVal !== bVal) return bVal - aVal;
    return b.totalRequests - a.totalRequests;
  });
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The instant of "today's local midnight in the venue's timezone", expressed
 * as a UTC Date. Naive `Date(ymd + 'T00:00:00Z')` lands at UTC midnight on
 * that date — for America/Chicago that's 6pm CT *yesterday*, missing the
 * morning of the venue's local day. Compute the IANA UTC offset against the
 * candidate midnight to land on the correct instant.
 */
function startOfTodayUTC(timeZone: string): Date {
  try {
    const now = new Date();
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const ymd = dateFmt.format(now); // YYYY-MM-DD in target tz
    // Start with naive UTC midnight on that date, then shift by the tz's offset
    // *at that moment* so we land at local midnight in UTC.
    const naiveUtc = new Date(`${ymd}T00:00:00Z`);
    const tzAtCandidate = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "shortOffset",
    });
    // Pull the offset string ("GMT-5", "GMT+1") from the candidate.
    const parts = tzAtCandidate.formatToParts(naiveUtc);
    const tzNamePart = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT+0";
    const m = tzNamePart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return naiveUtc;
    const sign = m[1] === "+" ? 1 : -1;
    const hours = Number(m[2] ?? 0);
    const mins = Number(m[3] ?? 0);
    const offsetMin = sign * (hours * 60 + mins);
    // Local midnight in the target tz == UTC midnight - offset.
    return new Date(naiveUtc.getTime() - offsetMin * 60 * 1000);
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
