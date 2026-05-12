import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const existing = await db.request.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (existing.status === "RESOLVED") {
    return NextResponse.json({ error: "ALREADY_RESOLVED" }, { status: 409 });
  }

  // First-acker wins. Compare-and-swap via updateMany — only updates if
  // no one else has claimed it AND the request is still PENDING. The
  // status filter prevents regressing a request that another staff
  // resolved-without-ack between our read and our write.
  const cas = await db.request.updateMany({
    where: { id: existing.id, acknowledgedById: null, status: "PENDING" },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedById: session.staffId,
    },
  });

  if (cas.count === 0) {
    const cur = await db.request.findUnique({
      where: { id: existing.id },
      include: { acknowledgedBy: { select: { name: true } } },
    });
    return NextResponse.json({
      id: cur?.id,
      status: cur?.status,
      acknowledgedAt: cur?.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: cur?.acknowledgedBy ? { name: cur.acknowledgedBy.name } : null,
      alreadyAcked: true,
    });
  }

  const updated = await db.request.findUnique({
    where: { id: existing.id },
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { name: true } },
    },
  });
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  void events.requestAcknowledged(updated.venueId, updated.sessionId, {
    id: updated.id,
    status: updated.status,
    acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: updated.acknowledgedById,
    tableLabel: updated.table.label,
    type: updated.type,
    acknowledgedBy: updated.acknowledgedBy ? { name: updated.acknowledgedBy.name } : null,
  });

  // Return the full ack record so the optimistic-update on the staff queue
  // can render the Hand off button immediately. The bug we fixed: the
  // client was filling acknowledgedBy.id with "" because the response only
  // carried {id,status}, which made the "is this mine?" check fail and
  // hide the Hand off button until the next poll/socket update.
  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: updated.acknowledgedById,
    acknowledgedBy: updated.acknowledgedBy
      ? { id: updated.acknowledgedById, name: updated.acknowledgedBy.name }
      : null,
  });
}
