import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { emit } from "@/lib/realtime";
import { rateLimitAsync } from "@/lib/rate-limit";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guest taps "Share with waiter". Stamps Wishlist.sharedWithStaffAt and
 * fires a `wishlist_shared` realtime event to the venue room. Staff PWAs
 * subscribe and surface a coral notification card with the table and
 * item list. The payload omits the sessionToken — only ids and item
 * names/prices are broadcast.
 */
const Body = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Cap "share with staff" at 5/min per session. The endpoint fires a
  // realtime event into the venue staff channel; without a limit a single
  // misbehaving tab could spam staff toasts.
  const gate = await rateLimitAsync(`wishlist:share:${parsed.sessionId}`, {
    windowMs: 60_000,
    max: 5,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs },
      { status: 429 }
    );
  }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const session = await db.guestSession.findUnique({
    where: { id: parsed.sessionId },
    select: {
      id: true,
      sessionToken: true,
      venueId: true,
      tableId: true,
      expiresAt: true,
      paidAt: true,
      table: { select: { id: true, label: true } },
    },
  });
  if (!session || session.venueId !== venue.id) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  }
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }
  if (session.paidAt) {
    return NextResponse.json({ error: "SESSION_CLOSED" }, { status: 410 });
  }

  const wishlist = await db.wishlist.findUnique({
    where: { guestSessionId: session.id },
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, priceCents: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!wishlist || wishlist.items.length === 0) {
    return NextResponse.json({ error: "WISHLIST_EMPTY" }, { status: 400 });
  }

  const shareAt = new Date();
  await db.wishlist.update({
    where: { id: wishlist.id },
    data: { sharedWithStaffAt: shareAt },
  });

  const itemPayload = wishlist.items.map(it => ({
    menuItemId: it.menuItem.id,
    name: it.menuItem.name,
    priceCents: it.menuItem.priceCents,
    quantity: it.quantity,
  }));

  // Realtime push — venue room only. Payload deliberately excludes the
  // sessionToken and any guest PII; staff only needs the wishlistId
  // (to deep-link) plus the table label and item summary.
  void emit({
    kind: "venue",
    id: venue.id,
    event: "wishlist_shared",
    payload: {
      wishlistId: wishlist.id,
      tableId: session.table?.id ?? session.tableId,
      tableLabel: session.table?.label ?? null,
      itemCount: wishlist.items.length,
      items: itemPayload,
      sharedAt: shareAt.toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    sharedAt: shareAt.toISOString(),
    itemCount: wishlist.items.length,
  });
}
