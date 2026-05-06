import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { getStaffSession } from "@/lib/auth/session";

export async function PATCH(_req: Request, ctx: { params: { id: string } }) {
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

  return NextResponse.json({ id: updated.id, status: updated.status });
}
