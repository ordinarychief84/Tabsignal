import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { originGuard } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { events } from "@/lib/realtime";
import { tabItems, tabTotals } from "@/domain/billing/tab";

/**
 * Close out a guest tab.
 *
 * This is the moment a member of staff takes payment on the venue's own
 * terminal and the table is done. TabCall doesn't touch the money — it
 * records that the visit ended, which is the thing the rest of the
 * product has been missing since guest payments were removed.
 *
 * `GuestSession.paidAt` is what Regulars counts visits from, what tip
 * pools window on, what the session export selects, and what the operator
 * revenue stats sum. Nothing had set it since the payment webhook went
 * away, so all four had been quietly stuck at zero. The column keeps its
 * name — it always meant "this tab is closed", the card was only ever how
 * that used to happen.
 *
 * Settling also ends the session for ordering: /api/v/[slug]/orders
 * refuses a tab with paidAt set, so a guest can't add to a bill that has
 * already been paid at the terminal.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Legacy STAFF rows were venue creators before RBAC — same normalisation
  // the rest of the app uses.
  const role = staff.role === "STAFF" ? "OWNER" : staff.role;
  if (!can(role, "tabs.settle")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't close out tabs." },
      { status: 403 },
    );
  }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    select: {
      id: true, venueId: true, paidAt: true, lineItems: true,
      table: { select: { id: true, label: true } },
    },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.venueId !== staff.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Idempotent: two servers tapping "Close out" on the same table is a
  // race worth expecting, not an error worth showing. The first stamp
  // stands so the visit time stays honest.
  if (session.paidAt) {
    return NextResponse.json({
      ok: true,
      alreadySettled: true,
      settledAt: session.paidAt.toISOString(),
    });
  }

  const settledAt = new Date();
  const totals = tabTotals(tabItems(session.lineItems));

  await db.guestSession.update({
    where: { id: session.id },
    data: { paidAt: settledAt },
  });

  void audit({
    venueId: session.venueId,
    actor: staff,
    action: "tab.settled",
    targetType: "GuestSession",
    targetId: session.id,
    metadata: {
      tableLabel: session.table.label,
      totalCents: totals.totalCents,
    },
  });

  // Tell the floor so a second device stops showing the tab as open.
  void events.orderStatusChanged(session.venueId, session.id, {
    kind: "tab_settled",
    sessionId: session.id,
    tableLabel: session.table.label,
    totalCents: totals.totalCents,
    settledAt: settledAt.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    alreadySettled: false,
    settledAt: settledAt.toISOString(),
    totalCents: totals.totalCents,
  });
}
