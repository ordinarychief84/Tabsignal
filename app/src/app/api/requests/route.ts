import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { events } from "@/lib/realtime";

const Body = z.object({
  sessionId: z.string().min(1),
  type: z.enum(["DRINK", "BILL", "HELP", "REFILL"]),
  note: z.string().max(120).optional(),
});

// PRD v2.0 F1: <= 1 request per 30s window per session.
const WINDOW_MS = 30_000;
const MAX_PER_WINDOW = 1;

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const limit = rateLimit(`req:${parsed.sessionId}`, { windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  const session = await db.guestSession.findUnique({ where: { id: parsed.sessionId } });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }
  if (session.paidAt) {
    return NextResponse.json({ error: "SESSION_CLOSED" }, { status: 410 });
  }

  const request = await db.request.create({
    data: {
      venueId: session.venueId,
      tableId: session.tableId,
      sessionId: session.id,
      type: parsed.type,
      note: parsed.note ?? null,
    },
    include: {
      table: {
        select: {
          label: true,
          assignments: { select: { staffMemberId: true } },
        },
      },
    },
  });

  const assignedStaffIds = request.table.assignments.map(a => a.staffMemberId);

  // Realtime push: venue room (everyone) + per-staff rooms for whoever covers
  // this table. Fire-and-forget — DB write is the source of truth.
  void events.newRequest(
    session.venueId,
    {
      id: request.id,
      type: request.type,
      note: request.note,
      status: request.status,
      tableId: request.tableId,
      tableLabel: request.table.label,
      sessionId: request.sessionId,
      createdAt: request.createdAt.toISOString(),
      assignedStaffIds,
    },
    assignedStaffIds
  );

  // TODO (F2): fire FCM push to staff fcmTokens for this venue
  // TODO (F6): enqueue BullMQ jobs for 90s + 3min escalation

  return NextResponse.json({ id: request.id, status: request.status }, { status: 201 });
}
