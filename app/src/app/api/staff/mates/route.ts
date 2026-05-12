import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

/**
 * Slim staff list — id + name only — for the handoff popover on the
 * floor app. Without this, the queue had to call /api/admin/staff which
 * leaks email + lastSeenAt + ackedCount to every signed-in floor user.
 *
 * Scoped to the caller's venue via session.venueId. ACTIVE staff only
 * (suspended bartenders shouldn't appear in the handoff dropdown).
 */
export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const mates = await db.staffMember.findMany({
    where: { venueId: session.venueId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    items: mates,
    selfId: session.staffId,
  });
}
