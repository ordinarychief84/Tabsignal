import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { MAX_EVENTS_PER_BATCH, sanitizeBatch } from "@/lib/guest-events";

/**
 * Guest analytics, batched from the phone.
 *
 * Fire-and-forget from the client's point of view: it always answers 204
 * whatever happens inside, because an analytics failure must never be
 * something a guest can see. A dropped batch costs a venue a rounding
 * error in a chart; a visible error while somebody is trying to order a
 * drink costs them the guest.
 *
 * Three things this route is careful about.
 *
 * NO PII REACHES THE TABLE. sanitizeBatch keeps exactly three fields per
 * event and discards the rest of the payload, whatever it contained. The
 * schema has nowhere to put a name or a number anyway — this is the
 * second lock on the same door.
 *
 * IDS ARE CHECKED AGAINST THIS VENUE'S MENU. A tampered payload could
 * otherwise write rows referencing another venue's dishes and quietly
 * pollute their numbers. Unknown ids are nulled rather than rejected, so
 * one stale id doesn't cost the whole batch.
 *
 * THE SESSION TOKEN IS REQUIRED. Without it anyone who learned a venue
 * slug could inflate its analytics from a script.
 */

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const dynamic = "force-dynamic";

// A guest tapping around generates events in bursts. This allows a
// steady stream of full batches while stopping a script from writing
// thousands of rows a minute.
const WINDOW_MS = 60_000;
const MAX_BATCHES_PER_WINDOW = 30;

const NO_CONTENT = new NextResponse(null, { status: 204 });

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  try {
    const body = (await req.json()) as {
      sessionId?: unknown;
      sessionToken?: unknown;
      events?: unknown;
    };

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : null;
    if (!sessionId || !sessionToken) return NO_CONTENT;

    const events = sanitizeBatch(body.events);
    if (events.length === 0) return NO_CONTENT;

    const session = await db.guestSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        venueId: true,
        sessionToken: true,
        expiresAt: true,
        venue: { select: { slug: true } },
      },
    });
    if (!session || session.venue.slug !== ctx.params.slug) return NO_CONTENT;
    if (!tokensEqual(sessionToken, session.sessionToken)) return NO_CONTENT;
    if (session.expiresAt.getTime() <= Date.now()) return NO_CONTENT;

    const limit = await rateLimitAsync(`ev:${sessionId}`, {
      windowMs: WINDOW_MS,
      max: MAX_BATCHES_PER_WINDOW,
    });
    if (!limit.ok) return NO_CONTENT;

    // Resolve the referenced ids against THIS venue. Anything that isn't
    // ours is stored as null: the event still counts, it just stops
    // claiming to be about a dish we can't vouch for.
    const menuIds = [...new Set(events.map(e => e.menuItemId).filter(Boolean) as string[])];
    const promoIds = [...new Set(events.map(e => e.promotionId).filter(Boolean) as string[])];

    const [ourItems, ourPromos] = await Promise.all([
      menuIds.length
        ? db.menuItem.findMany({
            where: { id: { in: menuIds.slice(0, MAX_EVENTS_PER_BATCH) }, venueId: session.venueId },
            select: { id: true },
          })
        : Promise.resolve([]),
      promoIds.length
        ? db.promotion.findMany({
            where: { id: { in: promoIds.slice(0, MAX_EVENTS_PER_BATCH) }, venueId: session.venueId },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const validItems = new Set(ourItems.map(i => i.id));
    const validPromos = new Set(ourPromos.map(p => p.id));

    await db.guestEvent.createMany({
      data: events.map(e => ({
        venueId: session.venueId,
        sessionId: session.id,
        type: e.type,
        menuItemId: e.menuItemId && validItems.has(e.menuItemId) ? e.menuItemId : null,
        promotionId: e.promotionId && validPromos.has(e.promotionId) ? e.promotionId : null,
      })),
    });

    return NO_CONTENT;
  } catch {
    // Analytics never surface to a guest. Swallow and move on.
    return NO_CONTENT;
  }
}
