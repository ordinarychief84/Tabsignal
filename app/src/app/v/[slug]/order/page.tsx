import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { OrderScreen } from "./order-screen";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue) notFound();

  const [categories, uncategorized] = await Promise.all([
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

  const flat = [
    ...categories.flatMap(c =>
      c.items.map(i => ({
        id: i.id,
        name: i.name,
        priceCents: i.priceCents,
        categoryName: c.name,
        ageRestricted: i.ageRestricted,
        description: i.description,
      }))
    ),
    ...uncategorized.map(i => ({
      id: i.id,
      name: i.name,
      priceCents: i.priceCents,
      categoryName: "",
      ageRestricted: i.ageRestricted,
      description: i.description,
    })),
  ];

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto max-w-md px-6 py-10">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Order ahead</h1>
          <p className="mt-2 text-sm text-slate/60">
            Pay now. Pick it up at the bar when ready.
          </p>
        </header>

        {flat.length === 0 ? (
          <p className="rounded-lg border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/60">
            Menu coming soon. Ask your server to take your order.
          </p>
        ) : (
          <OrderScreen slug={params.slug} items={flat} venueName={venue.name} />
        )}
      </div>
    </main>
  );
}
