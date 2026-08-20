import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { tabItems, tabTotals } from "@/domain/billing/tab";

/**
 * Open tabs on the floor, for the staff app.
 *
 * "Open" means a live guest session that has something on it and has not
 * been closed out. A session with an empty tab is someone who scanned the
 * QR and only sent signals — showing it would fill the list with tables
 * that have nothing to settle.
 *
 * Sits under /api/venue/[venueId]/ alongside the live-requests feed the
 * staff app already polls, and is read-only: closing out is a separate
 * POST so the write carries its own CSRF guard and permission check.
 */
export async function GET(_req: Request, ctx: { params: { venueId: string } }) {
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (staff.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const sessions = await db.guestSession.findMany({
    where: {
      venueId: ctx.params.venueId,
      paidAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      lineItems: true,
      createdAt: true,
      table: { select: { id: true, label: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const tabs = sessions
    .map(s => {
      const items = tabItems(s.lineItems);
      return {
        sessionId: s.id,
        tableId: s.table.id,
        tableLabel: s.table.label,
        itemCount: items.reduce((n, i) => n + i.quantity, 0),
        totalCents: tabTotals(items).totalCents,
        items: items.map(i => ({ name: i.name, quantity: i.quantity })),
        openedAt: s.createdAt.toISOString(),
      };
    })
    // Empty tabs are signal-only visits with nothing to settle.
    .filter(t => t.itemCount > 0);

  return NextResponse.json({ tabs });
}
