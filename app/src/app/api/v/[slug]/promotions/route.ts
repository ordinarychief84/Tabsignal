import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public guest read of currently-active promotions at this venue. Filters
 * by status=ACTIVE plus the time window (null sentinels = always-on). No
 * auth required, but we rate-limit at 30 req/min per IP so a scraper or
 * mis-behaving client can't hammer the DB. Includes the linked menu items
 * (id + name + price) so the guest renderer can badge them without a
 * second round-trip.
 */
export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const gate = await rateLimitAsync(`promotions:ip:${ip}:${ctx.params.slug}`, {
    windowMs: 60_000,
    max: 30,
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

  const now = new Date();
  const promotions = await db.promotion.findMany({
    where: {
      venueId: venue.id,
      status: "ACTIVE",
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, priceCents: true } },
        },
      },
    },
    take: 24,
  });

  return NextResponse.json({
    promotions: promotions.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      type: p.type,
      bannerImageUrl: p.bannerImageUrl,
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
      items: p.items
        .filter(it => it.menuItem)
        .map(it => ({
          id: it.id,
          menuItem: {
            id: it.menuItem!.id,
            name: it.menuItem!.name,
            priceCents: it.menuItem!.priceCents,
          },
        })),
    })),
  });
}
