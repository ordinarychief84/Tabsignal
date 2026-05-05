import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor } from "@/lib/bill";

const DEFAULT_TIP_PERCENT = 20; // PRD v2.0 — increased from 18% (phone-tipping anchor research)

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: { venue: { select: { zipCode: true, name: true } }, table: { select: { label: true } } },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.paidAt) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 410 });

  const items = parseLineItems(session.lineItems);
  const totals = totalsFor(items, session.venue.zipCode ?? "", DEFAULT_TIP_PERCENT);

  return NextResponse.json({
    sessionId: session.id,
    venueName: session.venue.name,
    tableLabel: session.table.label,
    items,
    defaultTipPercent: DEFAULT_TIP_PERCENT,
    totals,
  });
}
