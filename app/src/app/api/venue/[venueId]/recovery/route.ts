import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { tagLabel } from "@/lib/feedback";

/**
 * Guests who asked to speak to a manager, and haven't been seen yet.
 *
 * This is the most time-critical list in the product: the guest is still
 * in the building, they've already had a bad night, and the window to fix
 * it closes when they walk out. Everything else on the dashboard can wait
 * a minute; this can't.
 *
 * Deliberately excludes the guest's phone number even when one exists.
 * The manager needs the table, not the person's contact details — and
 * this endpoint is read by a screen that sits on a pass in a busy room.
 */
export async function GET(_req: Request, ctx: { params: { venueId: string } }) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (staff.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const rows = await db.feedbackReport.findMany({
    where: {
      venueId: ctx.params.venueId,
      managerRecoveryRequested: true,
      recoveryResolvedAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      rating: true,
      note: true,
      aiCategory: true,
      servedByName: true,
      createdAt: true,
      tags: { select: { tag: true } },
      session: { select: { table: { select: { label: true } } } },
    },
  });

  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      tableLabel: r.session.table.label,
      rating: r.rating,
      // Guest's own words. Shown because "the wait" and "the steak was
      // cold" need completely different responses.
      note: r.note,
      tags: r.tags.map(t => tagLabel(t.tag, r.servedByName, r.rating)),
      category: r.aiCategory,
      serverName: r.servedByName,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
