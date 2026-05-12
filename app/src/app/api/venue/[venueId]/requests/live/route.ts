import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { emit } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const ESCALATION_AGE_MS = 3 * 60_000; // 3 minutes (PRD F6)

export async function GET(_req: Request, ctx: { params: { venueId: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Inline lazy escalation. The dedicated Vercel cron runs only daily on
  // Hobby (per-minute schedules require Pro). Since the staff queue polls
  // this endpoint every 30s while open, doing the sweep here gives us
  // near-real-time escalation (≤30s lag) with zero extra cost — and it
  // only runs when there's an audience to see it, which is the only time
  // the escalation actually matters.
  //
  // updateMany is idempotent: the WHERE clause specifies status=PENDING
  // and escalatedAt=null, so repeated calls won't re-flip already-escalated
  // rows or fire duplicate events.
  const cutoff = new Date(Date.now() - ESCALATION_AGE_MS);
  const escalation = await db.request.updateMany({
    where: {
      venueId: ctx.params.venueId,
      status: "PENDING",
      createdAt: { lte: cutoff },
      escalatedAt: null,
    },
    data: { status: "ESCALATED", escalatedAt: new Date() },
  });
  // If anything was just escalated, emit a venue-room event so any OTHER
  // staff PWAs at the same venue paint the card coral immediately (this
  // tab will see it via the subsequent findMany; siblings need a push).
  if (escalation.count > 0) {
    void emit({
      kind: "venue",
      id: ctx.params.venueId,
      event: "requests_escalated_bulk",
      payload: { count: escalation.count, at: new Date().toISOString() },
    });
  }

  // Include recently-RESOLVED requests so the "Completed" tab on the
  // staff queue has data. Cap recently-resolved to the last hour — older
  // history is for the manager dashboard, not the floor app.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const requests = await db.request.findMany({
    where: {
      venueId: ctx.params.venueId,
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

  return NextResponse.json({
    items: requests.map(r => ({
      id: r.id,
      tableId: r.tableId,
      tableLabel: r.table.label,
      type: r.type,
      note: r.note,
      status: r.status,
      idCheckRequired: r.idCheckRequired,
      createdAt: r.createdAt.toISOString(),
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      escalatedAt: r.escalatedAt?.toISOString() ?? null,
      resolutionAction: r.resolutionAction,
      acknowledgedBy: r.acknowledgedBy ? { id: r.acknowledgedBy.id, name: r.acknowledgedBy.name } : null,
    })),
  });
}
