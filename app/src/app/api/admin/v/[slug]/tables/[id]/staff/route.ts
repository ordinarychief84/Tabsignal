import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { originGuard } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { events } from "@/lib/realtime";

/**
 * Who covers one table.
 *
 * The assignment itself already existed, editable from the People page —
 * per PERSON, as "which tables does Maya cover". This is the same
 * relation from the other end, because an owner standing in front of a
 * floor plan thinks "who has 12", not "which tables does Maya have", and
 * the People page is not where anybody looks for that.
 *
 * Writes the same TableAssignment rows. There is deliberately no second
 * model and no second source of truth — this is one relation with two
 * doors.
 */

export const dynamic = "force-dynamic";

const Body = z.object({
  // The complete set for this table. Sent whole rather than as add/remove
  // so two managers editing at once converge on a state somebody chose,
  // rather than on a merge neither of them asked for.
  staffIds: z.array(z.string().min(1)).max(50),
});

export async function PATCH(
  req: Request,
  ctx: { params: { slug: string; id: string } },
) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Legacy STAFF rows were venue creators before RBAC — same mapping the
  // rest of the admin surface uses.
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "staff.assign_tables")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't change table assignments." },
      { status: 403 },
    );
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const table = await db.table.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, label: true, venueId: true },
  });
  if (!table || table.venueId !== venue.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Every id must be an ACTIVE member of THIS venue. Without this an
  // owner could assign a table to somebody at another venue, and that
  // person's queue would start showing a room they have never been in.
  const eligible = await db.staffMember.findMany({
    where: { venueId: venue.id, status: "ACTIVE", id: { in: parsed.staffIds } },
    select: { id: true, name: true, displayName: true },
  });
  if (eligible.length !== parsed.staffIds.length) {
    return NextResponse.json(
      { error: "INVALID_STAFF", detail: "Someone on that list isn't active here." },
      { status: 400 },
    );
  }

  await db.$transaction([
    db.tableAssignment.deleteMany({ where: { tableId: table.id } }),
    ...(eligible.length > 0
      ? [
          db.tableAssignment.createMany({
            data: eligible.map(s => ({ tableId: table.id, staffMemberId: s.id })),
          }),
        ]
      : []),
  ]);

  void audit({
    venueId: venue.id,
    actor: session,
    action: "table.assignments_changed",
    targetType: "Table",
    targetId: table.id,
    metadata: { tableLabel: table.label, staffIds: eligible.map(s => s.id) },
  });

  // Tell the floor. A server whose section just changed should see it
  // without signing out — their console re-reads on this.
  void events.tableAssignmentChanged(venue.id, {
    tableId: table.id,
    tableLabel: table.label,
    staffIds: eligible.map(s => s.id),
  });

  return NextResponse.json({
    tableId: table.id,
    // Floor names, for the chips the page draws.
    staff: eligible.map(s => ({
      id: s.id,
      name: s.displayName ?? s.name,
    })),
  });
}
