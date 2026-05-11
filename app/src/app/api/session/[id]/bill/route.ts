import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { parseLineItems, totalsFor } from "@/lib/bill";

const DEFAULT_TIP_PERCENT = 20; // PRD v2.0 — increased from 18% (phone-tipping anchor research)

function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return timingSafeEqual(ab, bb);
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  // The bill carries the venue name, table label, and full line-item ledger
  // for the session — leaking it to anyone who guesses a session id would
  // expose ordering patterns and dollar amounts. Require the session token
  // (delivered to the guest's device only) for read access, matching the
  // contract of /items GET and /splits GET.
  const url = new URL(req.url);
  const sessionToken = url.searchParams.get("s");
  if (!sessionToken) {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 401 });
  }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: { venue: { select: { zipCode: true, name: true } }, table: { select: { label: true } } },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokensEqual(session.sessionToken, sessionToken)) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 401 });
  }
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
