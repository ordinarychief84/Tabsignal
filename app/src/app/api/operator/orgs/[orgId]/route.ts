/**
 * PATCH  /api/operator/orgs/[orgId]  → rename
 * DELETE /api/operator/orgs/[orgId]  → cascading delete (every venue + dependents + org)
 *
 * Plan flips happen in /api/operator/orgs/[orgId]/billing already;
 * this route covers the org-identity edits + danger-zone delete.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

type Ctx = { params: { orgId: string } };

const Patch = z.object({
  name: z.string().min(1).max(120).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  let parsed;
  try { parsed = Patch.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" }, { status: 400 }); }

  const updated = await db.organization.update({
    where: { id: ctx.params.orgId },
    data: parsed,
    select: { id: true, name: true, plan: true },
  });
  return NextResponse.json({ org: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const org = await db.organization.findUnique({
    where: { id: ctx.params.orgId },
    include: { venues: { select: { id: true } } },
  });
  if (!org) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const venueIds = org.venues.map(v => v.id);

  const staffIds = (await db.staffMember.findMany({
    where: { venueId: { in: venueIds } }, select: { id: true },
  })).map(s => s.id);
  const sessionIds = (await db.guestSession.findMany({
    where: { venueId: { in: venueIds } }, select: { id: true },
  })).map(s => s.id);

  await db.$transaction([
    db.linkTokenUse.deleteMany({ where: { staffId: { in: staffIds } } }),
    db.compAction.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    db.billSplit.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    db.feedbackReport.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.request.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.guestSession.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.preOrder.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.reservation.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.waitlist.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.menuItem.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.menuCategory.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.venueSpecial.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.tipPool.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.tableAssignment.deleteMany({ where: { table: { venueId: { in: venueIds } } } }),
    db.table.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.auditLog.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.staffMember.updateMany({ where: { venueId: { in: venueIds } }, data: { invitedById: null, suspendedById: null } }),
    db.staffMember.deleteMany({ where: { venueId: { in: venueIds } } }),
    db.venue.deleteMany({ where: { id: { in: venueIds } } }),
    // org-scoped
    db.orgMember.deleteMany({ where: { orgId: org.id } }),
    db.organization.delete({ where: { id: org.id } }),
  ]);

  return NextResponse.json({ ok: true, deleted: { venues: venueIds.length } });
}
