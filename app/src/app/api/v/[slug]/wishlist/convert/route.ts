import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Marks the wishlist CONVERTED and hands back the item list so the
 * caller can iterate to populate a cart / preorder. This endpoint
 * intentionally does NOT create a PreOrder — that flow lives in
 * /api/v/[slug]/preorders. Splitting the two lets us mark intent
 * even when conversion to a real order happens via a different
 * (e.g. POS-integrated) code path.
 */
const Body = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // 10/min per session. Caps abuse of a runaway client flipping wishlist
  // status back and forth.
  const gate = await rateLimitAsync(`wishlist:convert:${parsed.sessionId}`, {
    windowMs: 60_000,
    max: 10,
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
      expiresAt: true,
      paidAt: true,
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
          menuItem: {
            select: { id: true, name: true, priceCents: true, imageUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!wishlist) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (wishlist.items.length === 0) {
    return NextResponse.json({ error: "WISHLIST_EMPTY" }, { status: 400 });
  }

  await db.wishlist.update({
    where: { id: wishlist.id },
    data: { status: "CONVERTED" },
  });

  return NextResponse.json({
    ok: true,
    wishlistId: wishlist.id,
    items: wishlist.items.map(it => ({
      menuItemId: it.menuItem.id,
      name: it.menuItem.name,
      priceCents: it.menuItem.priceCents,
      imageUrl: it.menuItem.imageUrl,
      quantity: it.quantity,
      notes: it.notes,
    })),
  });
}
