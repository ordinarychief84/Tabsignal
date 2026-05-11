/**
 * Audit log — append-only feed of sensitive admin actions for the venue.
 *
 * Server-rendered for the first page; if a venue ever generates more
 * than ~100 entries we'll add a "Load more" button that hits
 * /api/admin/audit?before=… cursor-style.
 */

import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import type { StaffRole } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — audit log" };

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
  switch (action) {
    case "staff.invited":
      return `Invited ${m.email ?? "—"} as ${ROLE_LABELS[(m.role as StaffRole) ?? "STAFF"] ?? m.role ?? "?"}`;
    case "staff.invite_resent":
      return `Re-sent invite to ${m.email ?? "—"}${m.delivered === false ? " (delivery failed)" : ""}`;
    case "staff.role_changed": {
      const ch = (m.role as { from?: string; to?: string }) ?? {};
      return `Role for ${m.email ?? "—"}: ${ROLE_LABELS[(ch.from ?? "STAFF") as StaffRole] ?? ch.from ?? "?"} → ${ROLE_LABELS[(ch.to ?? "STAFF") as StaffRole] ?? ch.to ?? "?"}`;
    }
    case "staff.suspended":
      return `Suspended ${m.email ?? "—"}`;
    case "staff.reactivated":
      return `Reactivated ${m.email ?? "—"}`;
    case "staff.removed":
      return `Removed ${m.email ?? "—"} (${ROLE_LABELS[(m.role as StaffRole) ?? "STAFF"] ?? m.role ?? "?"})`;
    default:
      return action;
  }
}

export default async function AuditLogPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/audit`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  if (!can(session.role, "audit.view")) {
    return (
      <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/60">
        Your role can&rsquo;t view the audit log. Ask a Manager.
      </div>
    );
  }

  const rows = await db.auditLog.findMany({
    where: { venueId: venue.id },
    orderBy: { createdAt: "desc" },
    take: PAGE,
    select: {
      id: true,
      actorEmail: true,
      actorRole: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Compliance</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Audit log</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Every sensitive admin action — staff invites, role changes,
          suspensions, removals — is recorded here, append-only. Use this
          when you need to know who promoted Marcus to Manager three weeks
          ago.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No audit entries yet. Invite or change a staff member to populate this feed.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate/10 bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${ACTION_TONE[r.action] ?? "bg-slate/10 text-slate"}`}
                >
                  {ACTION_LABEL[r.action] ?? r.action}
                </span>
                <p className="flex-1 text-sm text-slate">{summary(r.action, r.metadata)}</p>
                <p className="text-[11px] text-slate/55">
                  {fmtRelative(r.createdAt)} · by{" "}
                  <span className="text-slate/70">{r.actorEmail}</span>
                  {r.actorRole ? (
                    <span className="ml-1 text-slate/40">({r.actorRole})</span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length === PAGE ? (
        <p className="mt-6 text-center text-[11px] text-slate/50">
          Showing the first {PAGE}. Older entries: GET /api/admin/audit?before=&lt;ISO&gt;
        </p>
      ) : null}
    </>
  );
}
