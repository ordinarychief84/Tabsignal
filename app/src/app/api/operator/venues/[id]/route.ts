/**
 * GET    /api/operator/venues/[id]  → fetch one (with relations)
 * PATCH  /api/operator/venues/[id]  → edit name/address/zip/branding/kill-switches
 * DELETE /api/operator/venues/[id]  → cascading delete (every venue-scoped row)
 *
 * Operator-only. Used by /operator/venues for inline edits + the
 * danger-zone delete button.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

type Ctx = { params: { id: string } };

const Patch = z.object({
  name:                z.string().min(1).max(120).optional(),
  address:             z.string().max(200).nullable().optional(),
  zipCode:             z.string().regex(/^\d{5}(-\d{4})?$/).nullable().optional(),
  timezone:            z.string().max(64).optional(),
  brandColor:          z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  alertEmails:         z.string().max(500).nullable().optional(),
  requireIdOnFirstDrink: z.boolean().optional(),
  requestsEnabled:     z.boolean().optional(),
  preorderEnabled:     z.boolean().optional(),
  reservationsEnabled: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const v = await db.venue.findUnique({
    where: { id: ctx.params.id },
    include: {
      org: { select: { id: true, name: true, plan: true } },
      _count: { select: { staff: true, tables: true, sessions: true, requests: true, feedback: true } },
    },
  });
  if (!v) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ venue: v });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  let parsed;
  try { parsed = Patch.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" }, { status: 400 }); }

  const v = await db.venue.findUnique({ where: { id: ctx.params.id } });
  if (!v) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.venue.update({
    where: { id: v.id },
    data: parsed,
    select: { id: true, slug: true, name: true, requestsEnabled: true, preorderEnabled: true, reservationsEnabled: true },
  });
  return NextResponse.json({ venue: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const v = await db.venue.findUnique({ where: { id: ctx.params.id } });
  if (!v) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Cascading wipe of every venue-scoped row. Mirrors the manual
  // delete pattern used during the test-data cleanup in this session.
  // Helpers: collect ids first since LinkTokenUse / CompAction / BillSplit
  // don't expose relation filters in their WhereInput.
  const staffIds = (await db.staffMember.findMany({
    where: { venueId: v.id }, select: { id: true },
  })).map(s => s.id);
  const sessionIds = (await db.guestSession.findMany({
    where: { venueId: v.id }, select: { id: true },
  })).map(s => s.id);

  await db.$transaction([
    db.linkTokenUse.deleteMany({ where: { staffId: { in: staffIds } } }),
    db.compAction.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    db.billSplit.deleteMany({ where: { sessionId: { in: sessionIds } } }),
    db.feedbackReport.deleteMany({ where: { venueId: v.id } }),
    db.request.deleteMany({ where: { venueId: v.id } }),
    db.guestSession.deleteMany({ where: { venueId: v.id } }),
    db.preOrder.deleteMany({ where: { venueId: v.id } }),
    db.reservation.deleteMany({ where: { venueId: v.id } }),
    db.waitlist.deleteMany({ where: { venueId: v.id } }),
    db.menuItem.deleteMany({ where: { venueId: v.id } }),
    db.menuCategory.deleteMany({ where: { venueId: v.id } }),
    db.venueSpecial.deleteMany({ where: { venueId: v.id } }),
    db.tipPool.deleteMany({ where: { venueId: v.id } }),
    db.tableAssignment.deleteMany({ where: { table: { venueId: v.id } } }),
    db.table.deleteMany({ where: { venueId: v.id } }),
    db.auditLog.deleteMany({ where: { venueId: v.id } }),
    // Clear self-FKs on staff before deleting them (otherwise the FK
    // ON DELETE SET NULL fires per-row, slow on big venues).
    db.staffMember.updateMany({ where: { venueId: v.id }, data: { invitedById: null, suspendedById: null } }),
    db.staffMember.deleteMany({ where: { venueId: v.id } }),
    db.venue.delete({ where: { id: v.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
