import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { SHIFT_STATUSES, type ShiftStatus } from "@/lib/shift";

/**
 * A staff member's own shift state.
 *
 * Deliberately self-service and self-scoped: it always writes the
 * signed-in person's row and takes no id, so there is no shape of
 * request that lets one server put another on a break. Managers change
 * employment status (StaffStatus) through the People page; this is only
 * "where am I right now".
 *
 * Starting a shift stamps shiftStartedAt; ending one clears it. Going on
 * a break leaves it alone — a break is part of the shift, and resetting
 * the clock would make "completed this shift" restart every time
 * somebody stepped outside.
 */

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(SHIFT_STATUSES as [ShiftStatus, ...ShiftStatus[]]),
});

export async function PATCH(req: Request) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const current = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, venueId: true, status: true, shiftStatus: true, shiftStartedAt: true },
  });
  // A suspended or deleted account may not come back on shift by asking.
  if (!current || current.venueId !== session.venueId || current.status !== "ACTIVE") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const next = parsed.status;
  const wasWorking = current.shiftStatus !== "OFF_SHIFT";
  const nowWorking = next !== "OFF_SHIFT";

  const data: { shiftStatus: ShiftStatus; shiftStartedAt?: Date | null } = {
    shiftStatus: next,
  };
  // Only the boundaries touch the clock. Break and meal break are part of
  // a shift, and restarting the clock every time someone stepped outside
  // would make "completed this shift" meaningless.
  if (!wasWorking && nowWorking) data.shiftStartedAt = new Date();
  if (wasWorking && !nowWorking) data.shiftStartedAt = null;

  const updated = await db.staffMember.update({
    where: { id: current.id },
    data,
    select: { shiftStatus: true, shiftStartedAt: true },
  });

  return NextResponse.json({
    shiftStatus: updated.shiftStatus,
    shiftStartedAt: updated.shiftStartedAt?.toISOString() ?? null,
  });
}

/**
 * What still needs handling before this person can reasonably go off
 * shift. The client uses it to warn rather than to block — a server is
 * allowed to leave, and a product that refuses would simply get lied to.
 */
export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const [openRequests, assignedTables, otherStaffOnShift] = await Promise.all([
    db.request.count({
      where: {
        venueId: session.venueId,
        acknowledgedById: session.staffId,
        status: { in: ["ACKNOWLEDGED", "ON_MY_WAY"] },
      },
    }),
    db.tableAssignment.count({ where: { staffMemberId: session.staffId } }),
    db.staffMember.count({
      where: {
        venueId: session.venueId,
        status: "ACTIVE",
        shiftStatus: "ON_SHIFT",
        id: { not: session.staffId },
      },
    }),
  ]);

  return NextResponse.json({ openRequests, assignedTables, otherStaffOnShift });
}
