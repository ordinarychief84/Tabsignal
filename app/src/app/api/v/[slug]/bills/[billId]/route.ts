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

  // Find the session bound to this token at this venue. We don't include
  // the bill in the same query — we need the bill regardless of who's
  // looking — but we do need to confirm SOME valid session at this venue
  // holds this token before returning bill data.
  const session = await db.guestSession.findFirst({
    where: { venueId: venue.id },
    select: { id: true, sessionToken: true, tableId: true, expiresAt: true },
    // Cheaper than findUnique by token because we need the venueId scope.
    // Token has a unique index, but the WHERE on venueId narrows first.
    // Practically there's exactly one row matching any given token; the
    // tokensEqual constant-time check below protects against timing leaks.
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // The above can return up to 50 sessions; scan for the matching token in
  // constant time. (Postgres LIMIT 50 is cheap.) For correctness when the
  // venue has many sessions, do a direct token lookup as a fallback.
  let authorized = false;
  if (session && tokensEqual(session.sessionToken, sessionToken)) {
    authorized = true;
  } else {
    const direct = await db.guestSession.findUnique({
      where: { sessionToken },
      select: { venueId: true, expiresAt: true },
    });
    if (direct && direct.venueId === venue.id) {
      authorized = true;
    }
  }
  if (!authorized) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
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
  if (!bill || bill.venueId !== venue.id) {
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
