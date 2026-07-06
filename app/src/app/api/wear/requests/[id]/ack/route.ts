import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { getWearAuth, isWearAuthFail } from "@/lib/auth/wear";

/**
 * POST /api/wear/requests/[id]/ack — "Got it" from the wrist.
 *
 * Same first-acker-wins compare-and-swap as the console route
 * (/api/requests/[id]/acknowledge) and the same realtime emit, so the
 * guest's beacon timeline and every staff surface update identically
 * whether the ack came from a phone, the console, or a watch. POST (not
 * PATCH) because several wearable HTTP stacks only speak GET/POST well.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await getWearAuth(req);
  if (isWearAuthFail(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const existing = await db.request.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.venueId !== auth.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (existing.status === "RESOLVED") {
    return NextResponse.json({ error: "ALREADY_RESOLVED" }, { status: 409 });
  }

  const cas = await db.request.updateMany({
    where: { id: existing.id, acknowledgedById: null, status: "PENDING" },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedById: auth.staffId,
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
      mine: cur?.acknowledgedById === auth.staffId,
      ackedBy: cur?.acknowledgedBy?.name ?? null,
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

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    mine: true,
    ackedBy: updated.acknowledgedBy?.name ?? null,
    alreadyAcked: false,
  });
}
