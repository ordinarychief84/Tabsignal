import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { events, emit } from "@/lib/realtime";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";

/**
 * Reassign an acknowledged request to a different staff member at the same
 * venue. Use when a server's shift ends mid-service or they need to
 * delegate. The original `acknowledgedAt` is preserved (we only swap the
 * acker), so SLA timing isn't reset.
 */
const Body = z.object({
  toStaffId: z.string().min(1),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const existing = await db.request.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (existing.status !== "ACKNOWLEDGED") {
    return NextResponse.json({ error: "NOT_ACKNOWLEDGED" }, { status: 409 });
  }

  const dest = await db.staffMember.findUnique({ where: { id: parsed.toStaffId } });
  if (!dest || dest.venueId !== session.venueId) {
    return NextResponse.json({ error: "INVALID_STAFF" }, { status: 400 });
  }
  if (dest.id === existing.acknowledgedById) {
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      acknowledgedById: dest.id,
      noChange: true,
    });
  }

  const updated = await db.request.update({
    where: { id: existing.id },
    data: { acknowledgedById: dest.id },
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
  });

  // Notify the venue (queue UIs reconcile name) AND the receiver's
  // personal staff room (so they see a "handed off to you" toast).
  void events.requestAcknowledged(updated.venueId, updated.sessionId, {
    id: updated.id,
    status: updated.status,
    acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: updated.acknowledgedById,
    acknowledgedBy: updated.acknowledgedBy ? { id: updated.acknowledgedBy.id, name: updated.acknowledgedBy.name } : null,
    tableLabel: updated.table.label,
    type: updated.type,
  });
  void emit({
    kind: "staff",
    id: dest.id,
    event: "request_handed_off_to_you",
    payload: {
      request: {
        id: updated.id,
        tableLabel: updated.table.label,
        type: updated.type,
        fromStaffId: existing.acknowledgedById,
      },
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    acknowledgedById: updated.acknowledgedById,
  });
}
