import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public read of currently-active specials at this venue. Filters to
// "active=true AND (startsAt is null OR startsAt <= now) AND (endsAt is
// null OR endsAt > now)" so always-on specials and time-windowed ones
// both behave correctly. Returns an empty array if nothing is live —
// the guest UI hides the section in that case.
export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const now = new Date();
  const specials = await db.venueSpecial.findMany({
    where: {
      venueId: venue.id,
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 8,
  });

  return NextResponse.json({
    specials: specials.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      priceCents: s.priceCents,
      startsAt: s.startsAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
    })),
  });
}
