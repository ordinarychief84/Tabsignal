import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { tablePicks } from "@/lib/waiter-console";
import { formatWait } from "@/lib/waiter-console";

/**
 * What a waiter standing at a table needs to know.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN, and why each one is excluded:
 *
 *   phone number        a server does not need it to bring water, and a
 *                       shared service tablet is the worst place to
 *                       keep one
 *   marketing consent   a commercial record, not a service fact
 *   campaign membership same
 *   guest profile       turning a visit into a dossier is a different
 *                       product with different consent
 *   previous feedback   what a guest said about a past visit is not a
 *                       thing to hand the server serving them now
 *   anything about money TabCall doesn't process payments and has no
 *                       bill to show
 *
 * What it does return: who is waiting, for what, for how long, and what
 * the table has shortlisted. That is the whole job.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: { venueId: string; tableId: string } },
) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // Venue is checked server-side, not inferred from the UI. A table id
  // from another venue must not resolve here however it was obtained.
  if (session.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const table = await db.table.findUnique({
    where: { id: ctx.params.tableId },
    select: {
      id: true,
      label: true,
      zone: true,
      venueId: true,
      assignments: { select: { staff: { select: { id: true, displayName: true, name: true } } } },
    },
  });
  if (!table || table.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const now = new Date();
  const [requests, picks, session_] = await Promise.all([
    db.request.findMany({
      where: {
        tableId: table.id,
        status: { in: ["PENDING", "ACKNOWLEDGED", "ON_MY_WAY", "ESCALATED"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        status: true,
        note: true,
        createdAt: true,
        acknowledgedById: true,
        acknowledgedBy: { select: { displayName: true, name: true } },
      },
    }),
    tablePicks({ venueId: table.venueId, tableId: table.id, now }),
    db.guestSession.findFirst({
      where: { tableId: table.id, expiresAt: { gt: now }, paidAt: null },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  return NextResponse.json({
    table: {
      id: table.id,
      label: table.label,
      zone: table.zone,
      // Names only, and the floor name at that — `name` may be a legal
      // name, and this can end up on a shared screen.
      assignedTo: table.assignments.map(a => a.staff.displayName ?? a.staff.name),
      assignedToMe: table.assignments.some(a => a.staff.id === session.staffId),
    },
    // Whether anyone is sitting there, and since when. Not who.
    seatedSince: session_?.createdAt.toISOString() ?? null,
    requests: requests.map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      waitedFor: formatWait(Math.floor((now.getTime() - r.createdAt.getTime()) / 1000)),
      claimedByMe: r.acknowledgedById === session.staffId,
      claimedBy: r.acknowledgedBy?.displayName ?? r.acknowledgedBy?.name ?? null,
    })),
    picks,
  });
}
