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
 * Guest Wishlist — table-session-scoped. The UNIQUE constraint on
 * (wishlistId, menuItemId) makes "add" idempotent: re-posting the same
 * item just updates the quantity / notes. The Wishlist row itself is
 * UNIQUE per guestSessionId, so there's never more than one active
 * wishlist per tab.
 *
 * All three verbs require the guest session token (constant-time compare,
 * same as the rest of the guest API) and verify that any menuItemId
 * belongs to the same venue the session is anchored to — otherwise a
 * guest at venue A could pin items from venue B.
 */

const slugParam = z.object({ slug: z.string().min(1) });

// GET reads session credentials from the URL query string. Earlier
// revisions parsed `req.json()`, but RFC 9110 makes GET bodies
// ill-defined, browsers' `fetch(..., { method: "GET", body: ... })`
// throws, and intermediate proxies / CDNs may strip them. Audit Finding #8.
const GetQuery = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
});

const PostBody = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(50).optional(),
  notes: z.string().max(280).optional(),
});

const DeleteBody = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  menuItemId: z.string().min(1).optional(),
});

type SessionRow = {
  id: string;
  sessionToken: string;
  venueId: string;
  tableId: string;
  expiresAt: Date;
  paidAt: Date | null;
};

async function authorize(
  slug: string,
  sessionId: string,
  sessionToken: string
): Promise<{ ok: true; session: SessionRow } | { ok: false; res: Response }> {
  const venue = await db.venue.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!venue) {
    return { ok: false, res: NextResponse.json({ error: "NOT_FOUND" }, { status: 404 }) };
  }
  const session = await db.guestSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      sessionToken: true,
      venueId: true,
      tableId: true,
      expiresAt: true,
      paidAt: true,
    },
  });
  if (!session || session.venueId !== venue.id) {
    return { ok: false, res: NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 }) };
  }
  if (!tokensEqual(session.sessionToken, sessionToken)) {
    return { ok: false, res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return { ok: false, res: NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 }) };
  }
  if (session.paidAt) {
    return { ok: false, res: NextResponse.json({ error: "SESSION_CLOSED" }, { status: 410 }) };
  }
  return { ok: true, session };
}

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  let parsedSlug;
  try { parsedSlug = slugParam.parse(ctx.params); }
  catch { return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 }); }

  // Session credentials come from the query string (sessionId + sessionToken).
  // The previous incarnation read JSON from the GET body, which is
  // problematic for browser fetch + intermediate proxies (audit Finding #8).
  const url = new URL(req.url);
  let parsed;
  try {
    parsed = GetQuery.parse({
      sessionId: url.searchParams.get("sessionId"),
      sessionToken: url.searchParams.get("sessionToken"),
    });
  } catch {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const auth = await authorize(parsedSlug.slug, parsed.sessionId, parsed.sessionToken);
  if (!auth.ok) return auth.res;

  const wishlist = await db.wishlist.findUnique({
    where: { guestSessionId: auth.session.id },
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

  return NextResponse.json({
    wishlist: {
      id: wishlist.id,
      status: wishlist.status,
      sharedWithStaffAt: wishlist.sharedWithStaffAt?.toISOString() ?? null,
      items: wishlist.items.map(it => ({
        id: it.id,
        quantity: it.quantity,
        notes: it.notes,
        menuItem: {
          id: it.menuItem.id,
          name: it.menuItem.name,
          priceCents: it.menuItem.priceCents,
          imageUrl: it.menuItem.imageUrl,
        },
      })),
    },
  });
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  let parsedSlug;
  try { parsedSlug = slugParam.parse(ctx.params); }
  catch { return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 }); }

  let parsed;
  try { parsed = PostBody.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" },
      { status: 400 }
    );
  }

  const auth = await authorize(parsedSlug.slug, parsed.sessionId, parsed.sessionToken);
  if (!auth.ok) return auth.res;

  // Cap "add to wishlist" at 30/min per session — generous compared to
  // the request-button limiter (1/30s) but still blocks runaway clients.
  const limit = await rateLimitAsync(`wishlist:${parsed.sessionId}`, {
    windowMs: 60_000,
    max: 30,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  // Verify the menu item belongs to this venue. Prevents cross-venue
  // pinning if a guest crafts a request with a stolen menuItemId.
  const menuItem = await db.menuItem.findFirst({
    where: { id: parsed.menuItemId, venueId: auth.session.venueId, isActive: true },
    select: { id: true },
  });
  if (!menuItem) {
    return NextResponse.json({ error: "MENU_ITEM_NOT_FOUND" }, { status: 404 });
  }

  // Upsert the wishlist row (one per session), then upsert the item.
  const wishlist = await db.wishlist.upsert({
    where: { guestSessionId: auth.session.id },
    create: {
      venueId: auth.session.venueId,
      tableId: auth.session.tableId,
      guestSessionId: auth.session.id,
      status: "ACTIVE",
    },
    update: {
      // If a previously cancelled/converted wishlist exists for this
      // session and the guest pins another item, reactivate it.
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const quantity = parsed.quantity ?? 1;
  const item = await db.wishlistItem.upsert({
    where: {
      wishlistId_menuItemId: {
        wishlistId: wishlist.id,
        menuItemId: parsed.menuItemId,
      },
    },
    create: {
      wishlistId: wishlist.id,
      menuItemId: parsed.menuItemId,
      quantity,
      notes: parsed.notes ?? null,
    },
    update: {
      quantity,
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
    },
    include: {
      menuItem: { select: { id: true, name: true, priceCents: true, imageUrl: true } },
    },
  });

  return NextResponse.json({
    wishlistId: wishlist.id,
    item: {
      id: item.id,
      quantity: item.quantity,
      notes: item.notes,
      menuItem: {
        id: item.menuItem.id,
        name: item.menuItem.name,
        priceCents: item.menuItem.priceCents,
        imageUrl: item.menuItem.imageUrl,
      },
    },
  });
}

export async function DELETE(req: Request, ctx: { params: { slug: string } }) {
  let parsedSlug;
  try { parsedSlug = slugParam.parse(ctx.params); }
  catch { return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 }); }

  let parsed;
  try { parsed = DeleteBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const auth = await authorize(parsedSlug.slug, parsed.sessionId, parsed.sessionToken);
  if (!auth.ok) return auth.res;

  const wishlist = await db.wishlist.findUnique({
    where: { guestSessionId: auth.session.id },
    select: { id: true },
  });
  if (!wishlist) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (parsed.menuItemId) {
    // Remove one item only — leave the wishlist row intact.
    await db.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, menuItemId: parsed.menuItemId },
    });
    return NextResponse.json({ ok: true });
  }

  // No menuItemId — clear the wishlist by marking it cancelled. We keep
  // the row (and items) for analytics, just flip the status.
  await db.wishlist.update({
    where: { id: wishlist.id },
    data: { status: "CANCELLED" },
  });
  await db.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
  return NextResponse.json({ ok: true, cleared: true });
}
