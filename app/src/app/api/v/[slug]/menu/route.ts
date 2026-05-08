import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public guest-facing menu read. No auth — the menu is what a venue shows
// on a printed list anyway. Only returns active categories and active
// items so 86'd drinks don't appear.
export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, name: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const [categories, uncategorizedItems] = await Promise.all([
    db.menuCategory.findMany({
      where: { venueId: venue.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    }),
    db.menuItem.findMany({
      where: { venueId: venue.id, isActive: true, categoryId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return NextResponse.json({
    venue: { id: venue.id, name: venue.name },
    categories: categories.map(c => ({
      id: c.id,
      name: c.name,
      items: c.items.map(formatItem),
    })),
    uncategorized: uncategorizedItems.map(formatItem),
  });
}

function formatItem(i: {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  ageRestricted: boolean;
  imageUrl: string | null;
}) {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    priceCents: i.priceCents,
    ageRestricted: i.ageRestricted,
    imageUrl: i.imageUrl,
  };
}
