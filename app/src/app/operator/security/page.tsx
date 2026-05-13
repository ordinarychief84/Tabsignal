/**
 * Platform Security dashboard for TabCall founders.
 *
 * Aggregates security-relevant signals so platform staff can scan one
 * page instead of clicking through `/operator/audit` plus per-venue
 * audit logs. Read-only — every section pulls directly via `db.*` in
 * this server component. No new API routes, no mutations.
 *
 * Sections (top → bottom):
 *   1. Recent platform-staff actions  (OperatorAuditLog, 7d, 50 rows)
 *   2. Impersonation events           (OperatorAuditLog, 30d)
 *   3. Suspicious staff activity      (AuditLog, 30d, grouped per venue)
 *   4. Platform admins                (PlatformAdmin current state)
 *   5. Monitoring gaps                (honest placeholders — not faked)
 *
 * Audit punch-list item 14: the platform did not have a single screen
 * that surfaced impersonation + role-change + admin-state signals
 * together. This is that screen.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · platform security" };

function fmtRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function fmtAbsolute(d: Date): string {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Redact metadata for table display: drop obvious secret-ish keys, cap
 * string length, and serialise as a compact key=value list so it fits
 * on one line per row.
 */
function redactMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "—";
  const m = metadata as Record<string, unknown>;
  const SKIP = new Set(["token", "jwt", "secret", "password", "apiKey", "api_key"]);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (SKIP.has(k)) {
      parts.push(`${k}=[redacted]`);
      continue;
    }
    let s: string;
    if (v === null || v === undefined) s = "—";
    else if (typeof v === "string") s = v.length > 48 ? `${v.slice(0, 45)}…` : v;
    else if (typeof v === "number" || typeof v === "boolean") s = String(v);
    else s = JSON.stringify(v).slice(0, 60);
    parts.push(`${k}=${s}`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

function metadataReason(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "—";
  const m = metadata as Record<string, unknown>;
  const r = m.reason;
  return typeof r === "string" && r.trim() ? r : "—";
}

export default async function PlatformSecurityPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator/security");
  if (!(await isPlatformStaffAsync(session))) {
    return redirect("/staff");
  }

  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Section 1: Recent platform-staff actions (last 7d, cap 50).
  const recentOperatorActions = await db.operatorAuditLog.findMany({
    where: { createdAt: { gte: since7d } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Section 2: Impersonation events (last 30d).
  const impersonationRows = await db.operatorAuditLog.findMany({
    where: {
      action: "operator.impersonate.start",
      createdAt: { gte: since30d },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // Resolve venue slugs in one batch for rows whose target is a Venue.
  const venueIds = Array.from(
    new Set(
      impersonationRows
        .filter(r => r.targetType === "Venue" && r.targetId)
        .map(r => r.targetId as string),
    ),
  );
  const venues = venueIds.length
    ? await db.venue.findMany({
        where: { id: { in: venueIds } },
        select: { id: true, slug: true, name: true },
      })
    : [];
  const venueById = new Map(venues.map(v => [v.id, v]));

  // Section 3: Suspicious staff activity (last 30d, grouped per venue).
  // We aggregate manually because Prisma groupBy doesn't include joined
  // venue metadata, and the dataset is small enough that a single
  // findMany + in-memory bucket is cheaper than groupBy + a second
  // venue lookup.
  const SUSPICIOUS_ACTIONS = ["staff.role_changed", "staff.suspended", "staff.removed"] as const;
  type SuspiciousAction = (typeof SUSPICIOUS_ACTIONS)[number];
  const suspiciousRows = await db.auditLog.findMany({
    where: {
      action: { in: [...SUSPICIOUS_ACTIONS] },
      createdAt: { gte: since30d },
    },
    select: {
      action: true,
      venueId: true,
      venue: { select: { slug: true, name: true, org: { select: { name: true } } } },
    },
  });
  type SuspiciousBucket = {
    venueId: string;
    slug: string;
    venueName: string;
    orgName: string;
    counts: Record<SuspiciousAction, number>;
    total: number;
  };
  const suspiciousByVenue = new Map<string, SuspiciousBucket>();
  for (const r of suspiciousRows) {
    const action = r.action as SuspiciousAction;
    const bucket = suspiciousByVenue.get(r.venueId) ?? {
      venueId: r.venueId,
      slug: r.venue.slug,
      venueName: r.venue.name,
      orgName: r.venue.org.name,
      counts: { "staff.role_changed": 0, "staff.suspended": 0, "staff.removed": 0 },
      total: 0,
    };
    bucket.counts[action] += 1;
    bucket.total += 1;
    suspiciousByVenue.set(r.venueId, bucket);
  }
  const suspiciousBuckets = Array.from(suspiciousByVenue.values()).sort(
    (a, b) => b.total - a.total,
  );

  // Section 4: Platform admins (current state).
  const admins = await db.platformAdmin.findMany({
    orderBy: [{ suspendedAt: "asc" }, { createdAt: "asc" }],
    include: {
      addedBy: { select: { email: true } },
    },
  });

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Compliance</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Platform security</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Cross-cutting view of who&rsquo;s acting on the platform, what they&rsquo;re
          touching, and which signals we currently have versus the gaps
          we&rsquo;ve flagged but don&rsquo;t track yet. Read-only.
        </p>
      </header>

      {/* Section 1 ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-umber">
            Recent platform-staff actions · last 7 days
          </h2>
          <span className="text-[11px] text-slate/45">
            {recentOperatorActions.length} of 50 cap
          </span>
        </div>
        {recentOperatorActions.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-8 text-center text-sm text-slate/55">
            No platform-staff actions logged in the last 7 days.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-[11px] uppercase tracking-[0.14em] text-slate/55">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Target</th>
                  <th className="px-4 py-2.5 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {recentOperatorActions.map(r => (
                  <tr key={r.id} className="border-b border-slate/5 last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate/70">
                      <span title={fmtAbsolute(r.createdAt)}>{fmtRelative(r.createdAt)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-slate">
                      {r.actorEmail}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate">
                      <code className="rounded bg-slate/5 px-1.5 py-0.5 text-[11px]">{r.action}</code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-slate/70">
                      {r.targetType ? (
                        <>
                          {r.targetType}
                          {r.targetId ? (
                            <span className="ml-1 font-mono text-[11px] text-slate/45">
                              {r.targetId.slice(0, 12)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate/55">
                      {redactMetadata(r.metadata)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2 ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-umber">
            Impersonation events · last 30 days
          </h2>
          <span className="text-[11px] text-slate/45">{impersonationRows.length} events</span>
        </div>
        {impersonationRows.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-8 text-center text-sm text-slate/55">
            No impersonation sessions started in the last 30 days.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-[11px] uppercase tracking-[0.14em] text-slate/55">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Operator</th>
                  <th className="px-4 py-2.5 font-medium">Target venue</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {impersonationRows.map(r => {
                  const venue =
                    r.targetType === "Venue" && r.targetId ? venueById.get(r.targetId) : null;
                  return (
                    <tr key={r.id} className="border-b border-slate/5 last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate/70">
                        <span title={fmtAbsolute(r.createdAt)}>{fmtRelative(r.createdAt)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[12px] text-slate">
                        {r.actorEmail}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-slate/70">
                        {venue ? (
                          <Link
                            href={`/admin/v/${venue.slug}/audit`}
                            className="text-umber underline-offset-4 hover:underline"
                          >
                            {venue.name} ↗
                          </Link>
                        ) : r.targetId ? (
                          <span className="font-mono text-[11px] text-slate/45">
                            {r.targetType ?? "?"} · {r.targetId.slice(0, 12)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-slate/70">
                        {metadataReason(r.metadata)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 3 ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-umber">
            Suspicious staff activity · last 30 days
          </h2>
          <span className="text-[11px] text-slate/45">
            {suspiciousBuckets.length} venue{suspiciousBuckets.length === 1 ? "" : "s"} active
          </span>
        </div>
        {suspiciousBuckets.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-8 text-center text-sm text-slate/55">
            No role changes, suspensions, or removals in the last 30 days.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-[11px] uppercase tracking-[0.14em] text-slate/55">
                  <th className="px-4 py-2.5 font-medium">Venue</th>
                  <th className="px-4 py-2.5 text-right font-medium">Role changes</th>
                  <th className="px-4 py-2.5 text-right font-medium">Suspended</th>
                  <th className="px-4 py-2.5 text-right font-medium">Removed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {suspiciousBuckets.map(b => (
                  <tr key={b.venueId} className="border-b border-slate/5 last:border-0">
                    <td className="px-4 py-2.5 text-[13px] text-slate">
                      <span className="text-slate/55">{b.orgName} · </span>
                      {b.venueName}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate/80">
                      {b.counts["staff.role_changed"]}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate/80">
                      {b.counts["staff.suspended"]}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate/80">
                      {b.counts["staff.removed"]}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate">
                      {b.total}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/v/${b.slug}/audit`}
                        className="text-[12px] text-umber underline-offset-4 hover:underline"
                      >
                        Drill down ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 4 ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-umber">
            Platform admins · current state
          </h2>
          <Link
            href="/operator/admins"
            className="text-[11px] text-umber underline-offset-4 hover:underline"
          >
            Manage ↗
          </Link>
        </div>
        {admins.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-8 text-center text-sm text-slate/55">
            No DB-managed platform admins. Allowlist is env-only.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate/10 text-[11px] uppercase tracking-[0.14em] text-slate/55">
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Added by</th>
                  <th className="px-4 py-2.5 font-medium">Added</th>
                  <th className="px-4 py-2.5 font-medium">Last seen</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {admins.map(a => {
                  const suspended = a.suspendedAt !== null;
                  return (
                    <tr
                      key={a.id}
                      className={`border-b border-slate/5 last:border-0 ${
                        suspended ? "bg-coral/5" : ""
                      }`}
                    >
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 font-mono text-[12px] ${
                          suspended ? "text-coral" : "text-slate"
                        }`}
                      >
                        {a.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-slate/80">
                        {a.name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-slate/55">
                        {a.addedBy?.email ?? "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-2.5 text-[12px] text-slate/70"
                        title={fmtAbsolute(a.createdAt)}
                      >
                        {fmtRelative(a.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-slate/70">
                        {a.lastSeenAt ? (
                          <span title={fmtAbsolute(a.lastSeenAt)}>
                            {fmtRelative(a.lastSeenAt)}
                          </span>
                        ) : (
                          <span className="text-slate/40">never</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {suspended ? (
                          <span
                            className="rounded-full bg-coral/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-coral"
                            title={
                              a.suspendedAt
                                ? `Suspended ${fmtAbsolute(a.suspendedAt)}`
                                : "Suspended"
                            }
                          >
                            Suspended
                          </span>
                        ) : (
                          <span className="rounded-full bg-chartreuse/30 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 5 ───────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-umber">
            Monitoring gaps · signals we don&rsquo;t track yet
          </h2>
        </div>
        <p className="mb-4 max-w-2xl text-[12px] text-slate/55">
          Surfaced from the security audit. These cards are intentionally
          honest. We don&rsquo;t fake numbers. Each note describes what would
          be needed to start tracking.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate/10 bg-white/60 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate/45">
              Failed login attempts
            </p>
            <p className="mt-2 text-sm text-slate/55">
              Not tracked yet. Add to <code className="rounded bg-slate/5 px-1.5 py-0.5 text-[11px]">/api/auth/start</code> if needed.
            </p>
          </div>
          <div className="rounded-2xl border border-slate/10 bg-white/60 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate/45">
              Suspicious geographic activity
            </p>
            <p className="mt-2 text-sm text-slate/55">Not tracked.</p>
          </div>
          <div className="rounded-2xl border border-slate/10 bg-white/60 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate/45">
              Session count per user
            </p>
            <p className="mt-2 text-sm text-slate/55">
              JWT-based, no session table to count from.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
