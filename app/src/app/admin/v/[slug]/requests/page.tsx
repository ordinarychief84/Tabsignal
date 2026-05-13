import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { emit } from "@/lib/realtime";
import { RequestsList } from "./requests-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · live requests" };

// Same threshold the live endpoint uses (PRD F6). Replicated here so the
// server-rendered initial state already reflects escalations without
// needing a second roundtrip to /requests/live.
const ESCALATION_AGE_MS = 3 * 60_000;

export default async function AdminLiveRequestsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await getStaffSession();
  if (!session) {
    redirect(`/staff/login?next=/admin/v/${params.slug}/requests`);
  }

  // Allow anyone with floor permissions (SERVER, HOST, MANAGER, OWNER,
  // PLATFORM, STAFF) to view this page. Action endpoints re-gate writes
  // themselves so we don't need to mirror those checks in the UI.
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "requests.acknowledge")) {
    redirect(`/admin/v/${params.slug}`);
  }

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  // Inline lazy escalation — same logic as /api/venue/[venueId]/requests/live.
  // Flips PENDING rows older than 3min to ESCALATED so the initial render
  // shows them correctly bucketed without a client round-trip.
  const cutoff = new Date(Date.now() - ESCALATION_AGE_MS);
  const escalation = await db.request.updateMany({
    where: {
      venueId: venue.id,
      status: "PENDING",
      createdAt: { lte: cutoff },
      escalatedAt: null,
    },
    data: { status: "ESCALATED", escalatedAt: new Date() },
  });
  if (escalation.count > 0) {
    void emit({
      kind: "venue",
      id: venue.id,
      event: "requests_escalated_bulk",
      payload: { count: escalation.count, at: new Date().toISOString() },
    });
  }

  // Initial dataset: PENDING/ACKNOWLEDGED/ESCALATED + recently-RESOLVED
  // (last hour). Matches the shape of /api/venue/[venueId]/requests/live so
  // the client can swap in poll responses without translating.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const rows = await db.request.findMany({
    where: {
      venueId: venue.id,
      OR: [
        { status: { in: ["PENDING", "ACKNOWLEDGED", "ESCALATED"] } },
        { status: "RESOLVED", resolvedAt: { gte: oneHourAgo } },
      ],
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
    take: 200,
  });

  const initial = rows.map(r => ({
    id: r.id,
    tableId: r.tableId,
    tableLabel: r.table.label,
    type: r.type as "DRINK" | "BILL" | "HELP" | "REFILL",
    note: r.note,
    status: r.status as "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED",
    idCheckRequired: r.idCheckRequired,
    createdAt: r.createdAt.toISOString(),
    acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    escalatedAt: r.escalatedAt?.toISOString() ?? null,
    resolutionAction: r.resolutionAction ?? null,
    acknowledgedBy: r.acknowledgedBy
      ? { id: r.acknowledgedBy.id, name: r.acknowledgedBy.name }
      : null,
  }));

  // Bucket counts for the summary stat cards. Mirrors the client-side
  // bucketing so the header reflects the same numbers the tabs do.
  const now = Date.now();
  const DELAYED_THRESHOLD_MS = 90_000;
  const counts = { pending: 0, active: 0, delayed: 0, completed: 0 };
  for (const r of initial) {
    if (r.status === "RESOLVED") counts.completed += 1;
    else if (r.status === "ESCALATED") counts.delayed += 1;
    else if (r.status === "ACKNOWLEDGED") counts.active += 1;
    else {
      const age = now - new Date(r.createdAt).getTime();
      if (age >= DELAYED_THRESHOLD_MS) counts.delayed += 1;
      else counts.pending += 1;
    }
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
          {venue.name}
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Live requests</h1>
        <p className="mt-2 text-sm text-slate/60">
          Every open ask on the floor, plus what wrapped in the last hour.
          Acknowledge, hand off, or close them here without leaving the
          admin console.
        </p>
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pending"   value={String(counts.pending)}   hint="Not yet picked up" />
        <Stat label="Active"    value={String(counts.active)}    hint="Acknowledged & in progress" />
        <Stat label="Delayed"   value={String(counts.delayed)}   hint=">90s old or escalated" coral={counts.delayed > 0} />
        <Stat label="Completed" value={String(counts.completed)} hint="Resolved in the last hour" />
      </div>

      <RequestsList
        slug={params.slug}
        venueId={venue.id}
        staffId={session.staffId}
        initial={initial}
      />
    </>
  );
}

function Stat({ label, value, hint, coral = false }: { label: string; value: string; hint?: string; coral?: boolean }) {
  return (
    <div className={[
      "rounded-2xl border bg-white px-5 py-4",
      coral ? "border-coral/40" : "border-slate/10",
    ].join(" ")}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className={[
        "mt-2 font-mono text-3xl tabular-nums",
        coral ? "text-coral" : "text-slate",
      ].join(" ")}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate/50">{hint}</p> : null}
    </div>
  );
}
