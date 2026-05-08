import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { MenuPanel } from "./menu-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — menu" };

export default async function MenuPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/menu`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const [categories, items] = await Promise.all([
    db.menuCategory.findMany({
      where: { venueId: venue.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.menuItem.findMany({
      where: { venueId: venue.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Menu</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Drinks &amp; food</h1>
        <p className="mt-2 text-sm text-slate/60">
          What guests can order. Inactive items are hidden from the guest browse view
          but stay around for analytics.
        </p>
      </header>

      <MenuPanel
        slug={params.slug}
        initialCategories={categories.map(c => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
        }))}
        initialItems={items.map(i => ({
          id: i.id,
          name: i.name,
          description: i.description,
          priceCents: i.priceCents,
          categoryId: i.categoryId,
          isActive: i.isActive,
          ageRestricted: i.ageRestricted,
          sortOrder: i.sortOrder,
          imageUrl: i.imageUrl,
        }))}
      />
    </>
  );
}
