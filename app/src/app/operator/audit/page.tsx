/**
 * Cross-venue audit log for TabCall founders.
 *
 * Mirrors the per-venue audit page at /admin/v/[slug]/audit but joins
 * across every venue + org so a founder can see every staff
 * mutation platform-wide. First page server-rendered; deeper history
 * paginates through /api/operator/audit.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { StaffRole } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · global audit log" };

const PAGE = 100;

const ACTION_LABEL: Record<string, string> = {
  "staff.invited": "Invited",
  "staff.invite_resent": "Re-sent invite",
  "staff.role_changed": "Changed role",
  "staff.suspended": "Suspended",
  "staff.reactivated": "Reactivated",
  "staff.removed": "Removed",
  "staff.updated": "Updated",
};

const ACTION_TONE: Record<string, string> = {
  "staff.invited": "bg-sea/30 text-slate",
  "staff.invite_resent": "bg-sea/20 text-slate",
  "staff.role_changed": "bg-chartreuse/30 text-slate",
  "staff.suspended": "bg-coral/15 text-coral",
  "staff.reactivated": "bg-chartreuse/30 text-slate",
  "staff.removed": "bg-coral/20 text-coral",
};

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

function summary(action: string, metadata: unknown): string {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const role = (r: unknown) => ROLE_LABELS[(r as StaffRole) ?? "STAFF"] ?? String(r ?? "?");
  switch (action) {
    case "staff.invited":
      return `Invited ${m.email ?? "—"} as ${role(m.role)}`;
    case "staff.invite_resent":
      return `Re-sent invite to ${m.email ?? "—"}${m.delivered === false ? " (delivery failed)" : ""}`;
    case "staff.role_changed": {
      const ch = (m.role as { from?: string; to?: string }) ?? {};
      return `Role for ${m.email ?? "—"}: ${role(ch.from)} → ${role(ch.to)}`;
    }
    case "staff.suspended":
      return `Suspended ${m.email ?? "—"}`;
    case "staff.reactivated":
      return `Reactivated ${m.email ?? "—"}`;
    case "staff.removed":
      return `Removed ${m.email ?? "—"} (${role(m.role)})`;
    default:
      return action;
  }
}

export default async function GlobalAuditLogPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator/audit");
  if (!(await isPlatformStaffAsync(session))) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium text-slate">Operator only.</h1>
          <p className="mt-3 text-sm text-slate/60">Audit log is gated to TabCall&rsquo;s operator allowlist.</p>
        </div>
      </main>
    );
  }

  const rows = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: PAGE,
    include: {
      venue: { select: { slug: true, name: true, org: { select: { name: true } } } },
    },
  });

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Compliance</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Global audit log</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Every sensitive admin action across every venue. Click a row&rsquo;s
          venue to jump into that venue&rsquo;s admin. Filter by action / actor
          via{" "}
          <Link className="underline" href="/operator/audit">
            /api/operator/audit
          </Link>{" "}
          query params.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No audit entries platform-wide yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="rounded-2xl border border-slate/10 bg-white px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${ACTION_TONE[r.action] ?? "bg-slate/10 text-slate"}`}
                >
                  {ACTION_LABEL[r.action] ?? r.action}
                </span>
                <p className="flex-1 text-sm text-slate">{summary(r.action, r.metadata)}</p>
                <div className="text-right text-[11px] text-slate/55">
                  <p>
                    {fmtRelative(r.createdAt)} · by{" "}
                    <span className="text-slate/70">{r.actorEmail}</span>
                    {r.actorRole ? (
                      <span className="ml-1 text-slate/40">({r.actorRole})</span>
                    ) : null}
                  </p>
                  <p>
                    <Link
                      href={`/admin/v/${r.venue.slug}/audit`}
                      className="text-umber underline-offset-4 hover:underline"
                    >
                      {r.venue.org.name} · {r.venue.name} ↗
                    </Link>
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length === PAGE ? (
        <p className="mt-6 text-center text-[11px] text-slate/50">
          Showing the latest {PAGE}. Older entries: GET /api/operator/audit?before=&lt;ISO&gt;
        </p>
      ) : null}
    </>
  );
}
