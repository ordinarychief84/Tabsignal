import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { shiftSummary, waiterTables } from "@/lib/waiter-console";

/**
 * The floor and the shift numbers, refreshed.
 *
 * Same data the console rendered on load, re-read on an interval and
 * whenever the queue's socket says a request changed. Read-only and
 * scoped to the caller's own venue and their own assignments — nothing
 * here can be widened by asking for a different venue id.
 *
 * Kept separate from the live-requests endpoint on purpose: that one is
 * polled every 30 seconds by every open staff tab and is the hot path
 * for service. This is a slower, wider read, and coupling them would
 * make the important one heavier.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { venueId: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (session.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, shiftStartedAt: true, assignments: { select: { tableId: true } } },
  });
  if (!staff) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const assignedTableIds = staff.assignments.map(a => a.tableId);
  const [tables, summary] = await Promise.all([
    waiterTables({ venueId: session.venueId, staffId: staff.id }),
    shiftSummary({
      venueId: session.venueId,
      staffId: staff.id,
      assignedTableIds,
      shiftStartedAt: staff.shiftStartedAt,
    }),
  ]);

  return NextResponse.json({ tables, summary });
}
