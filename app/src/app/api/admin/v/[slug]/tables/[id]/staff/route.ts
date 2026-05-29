import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const Body = z.object({
  staffIds: z.array(z.string().min(1)),
});

// Table-centric counterpart to PUT /api/admin/staff/[id]/tables. That route
// answers "which tables does this server cover?"; this one answers "which
// servers cover this table?". Both write the same TableAssignment join rows —
// a manager can drive coverage from whichever mental model fits (per-person
// on the People page, or per-table on the Tables page).
//
// Plan tier matches table CRUD ("free"): every venue can route requests to
// the right server. The role gate is staff.assign_tables (Owner/Manager).

/** Replace the full set of staff assigned to one table. */
export async function PUT(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "staff.assign_tables");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Table must belong to the caller's venue.
  const table = await db.table.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, venueId: true },
  });
  if (!table || table.venueId !== gate.venueId) {
    return NextResponse.json({ error: "TABLE_NOT_FOUND" }, { status: 404 });
  }

  // Validate every staffId belongs to this venue and isn't soft-removed.
  // DELETED rows are excluded from assignment writes (mirrors the schema
  // note on StaffStatus.DELETED) so a fired server can't be re-rostered.
  const dedupedIds = [...new Set(parsed.staffIds)];
  const staff = dedupedIds.length === 0
    ? []
    : await db.staffMember.findMany({
        where: { id: { in: dedupedIds }, venueId: gate.venueId, status: { not: "DELETED" } },
        select: { id: true },
      });
  if (staff.length !== dedupedIds.length) {
    return NextResponse.json({ error: "INVALID_STAFF_FOR_VENUE" }, { status: 400 });
  }

  await db.$transaction([
    db.tableAssignment.deleteMany({ where: { tableId: table.id } }),
    ...(staff.length === 0
      ? []
      : [
          db.tableAssignment.createMany({
            data: staff.map(s => ({ tableId: table.id, staffMemberId: s.id })),
          }),
        ]),
  ]);

  return NextResponse.json({
    tableId: table.id,
    staffIds: staff.map(s => s.id),
  });
}

export async function GET(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const table = await db.table.findUnique({
    where: { id: ctx.params.id },
    select: {
      id: true,
      venueId: true,
      assignments: { select: { staff: { select: { id: true, name: true } } } },
    },
  });
  if (!table || table.venueId !== gate.venueId) {
    return NextResponse.json({ error: "TABLE_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    tableId: table.id,
    staff: table.assignments.map(a => ({ id: a.staff.id, name: a.staff.name })),
  });
}
