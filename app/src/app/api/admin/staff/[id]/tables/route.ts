import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

const Body = z.object({
  tableIds: z.array(z.string().min(1)),
});

/** Replace the full set of table assignments for one staff member. */
export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "staff.assign_tables")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't assign tables." },
      { status: 403 }
    );
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const staff = await db.staffMember.findUnique({ where: { id: ctx.params.id } });
  if (!staff) return NextResponse.json({ error: "STAFF_NOT_FOUND" }, { status: 404 });
  if (staff.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Validate every tableId actually belongs to this venue.
  const tables = await db.table.findMany({
    where: { id: { in: parsed.tableIds }, venueId: staff.venueId },
    select: { id: true },
  });
  if (tables.length !== parsed.tableIds.length) {
    return NextResponse.json({ error: "INVALID_TABLE_FOR_VENUE" }, { status: 400 });
  }

  await db.$transaction([
    db.tableAssignment.deleteMany({ where: { staffMemberId: staff.id } }),
    ...(tables.length === 0
      ? []
      : [
          db.tableAssignment.createMany({
            data: tables.map(t => ({ staffMemberId: staff.id, tableId: t.id })),
          }),
        ]),
  ]);

  return NextResponse.json({
    staffId: staff.id,
    tableIds: tables.map(t => t.id),
  });
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const staff = await db.staffMember.findUnique({
    where: { id: ctx.params.id },
    include: { assignments: { include: { table: true } } },
  });
  if (!staff) return NextResponse.json({ error: "STAFF_NOT_FOUND" }, { status: 404 });
  if (staff.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({
    staffId: staff.id,
    tables: staff.assignments.map(a => ({ id: a.table.id, label: a.table.label })),
  });
}
