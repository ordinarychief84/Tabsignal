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

  const updated = await db.request.update({
    where: { id: existing.id },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: existing.acknowledgedAt ?? new Date(),
      acknowledgedById: session.staffId,
    },
    include: { table: { select: { label: true } } },
  });

  void events.requestAcknowledged(updated.venueId, updated.sessionId, {
    id: updated.id,
    status: updated.status,
    acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: updated.acknowledgedById,
    tableLabel: updated.table.label,
    type: updated.type,
  });

  // TODO: cancel BullMQ escalation jobs for this request

  return NextResponse.json({ id: updated.id, status: updated.status });
}
