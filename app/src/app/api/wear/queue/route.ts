import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWearAuth, isWearAuthFail } from "@/lib/auth/wear";

/**
 * GET /api/wear/queue — the open-request queue, shaped for a wrist.
 *
 * Design constraints that differ from the phone PWA:
 *   - Watches poll instead of holding sockets (radio + battery). The
 *     response carries pollAfterMs so the server sets the pace: fast
 *     while something is open, slow when the floor is quiet. Push (FCM
 *     on Wear OS) wakes the app between polls.
 *   - Payload stays small: open requests only, flat fields, no nesting
 *     beyond what a watch list row renders.
 *   - `mine` + `assignedToMe` let the watch sort "my tables" first
 *     without knowing anything about venue table topology.
 */
export async function GET(req: Request) {
  const auth = await getWearAuth(req);
  if (isWearAuthFail(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const open = await db.request.findMany({
    where: {
      venueId: auth.venueId,
      status: { in: ["PENDING", "ACKNOWLEDGED", "ESCALATED"] },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      table: {
        select: {
          label: true,
          assignments: { select: { staffMemberId: true } },
        },
      },
      acknowledgedBy: { select: { id: true, name: true } },
    },
  });

  const now = Date.now();
  const requests = open.map(r => ({
    id: r.id,
    type: r.type,
    status: r.status,
    table: r.table.label,
    note: r.note,
    idCheck: r.idCheckRequired,
    ageSeconds: Math.max(0, Math.floor((now - r.createdAt.getTime()) / 1000)),
    assignedToMe: r.table.assignments.some(a => a.staffMemberId === auth.staffId),
    mine: r.acknowledgedById === auth.staffId,
    ackedBy: r.acknowledgedBy ? r.acknowledgedBy.name : null,
  }));

  const hasUrgent = requests.some(r => r.status === "PENDING" || r.status === "ESCALATED");

  return NextResponse.json({
    serverTime: new Date(now).toISOString(),
    staff: { id: auth.staffId, name: auth.staffName },
    pollAfterMs: hasUrgent ? 5_000 : 20_000,
    requests,
  });
}
