import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

// Read a Bill (v2 schema) by id, gated by *any* live guest-session token
// at the same venue. Multiple guests sharing one table can each scan the QR,
// each gets their own GuestSession token, but they're all viewing the same
// physical bill — so we authorize on "is this token bound to a session at
// this venue?" rather than the specific session that created the Order.

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(req: Request, ctx: { params: { slug: string; billId: string } }) {
  const url = new URL(req.url);
  const sessionToken = url.searchParams.get("s") ?? url.searchParams.get("sessionToken");
  if (!sessionToken) {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 401 });
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, name: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Direct token lookup. The sessionToken column is UNIQUE, so this is the
  // canonical way to find the requesting session. We then verify it belongs
  // to the requested venue and that the token matches in constant time
  // (Prisma's WHERE-by-unique-key already filtered, but the constant-time
  // compare keeps the check uniform across the route).
  const session = await db.guestSession.findUnique({
    where: { sessionToken },
    select: { id: true, sessionToken: true, tableId: true, venueId: true, expiresAt: true },
  });
  if (!session || session.venueId !== venue.id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (!tokensEqual(session.sessionToken, sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }

  const bill = await db.bill.findUnique({
    where: { id: ctx.params.billId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      splits: {
        include: { splitItems: true },
        orderBy: { createdAt: "asc" },
      },
      table: { select: { label: true } },
    },
  });
  // Scope by venue AND table. Same-venue guests at OTHER tables shouldn't
  // be able to read a bill just because they hold any session token at the
  // venue. The qrToken landing flow seats every guest at the table that
  // owns this bill, so this is a tight match.
  if (!bill || bill.venueId !== venue.id || bill.tableId !== session.tableId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    id: bill.id,
    venueId: bill.venueId,
    venueName: venue.name,
    tableLabel: bill.table?.label ?? null,
    status: bill.status,
    subtotalCents: bill.subtotalCents,
    taxCents: bill.taxCents,
    serviceCents: bill.serviceCents,
    tipTotalCents: bill.tipTotalCents,
    totalCents: bill.totalCents,
    amountPaidCents: bill.amountPaidCents,
    amountDueCents: bill.amountDueCents,
    items: bill.items.map(i => ({
      id: i.id,
      nameSnapshot: i.nameSnapshot,
      priceCents: i.priceCents,
      quantity: i.quantity,
      status: i.status,
      paidBySplitId: i.paidBySplitId,
    })),
    splits: bill.splits.map(s => ({
      id: s.id,
      status: s.status,
      subtotalCents: s.subtotalCents,
      taxCents: s.taxCents,
      tipCents: s.tipCents,
      totalCents: s.totalCents,
      paidAt: s.paidAt?.toISOString() ?? null,
      billItemIds: s.splitItems.map(si => si.billItemId),
    })),
  });
}
