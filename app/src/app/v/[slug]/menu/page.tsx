import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { dollars } from "@/lib/bill";

export const dynamic = "force-dynamic";

export default async function PublicMenuPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, brandColor: true },
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

  const hasAnything = categories.some(c => c.items.length > 0) || uncategorized.length > 0;

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto max-w-md px-6 py-10">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{venue.name}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Menu</h1>
        </header>

        {!hasAnything ? (
          <p className="rounded-lg border border-slate/10 bg-white px-5 py-8 text-center text-sm text-slate/60">
            Menu coming soon. Ask your server.
          </p>
        ) : null}

        {categories.map(c => (
          c.items.length === 0 ? null : (
            <section key={c.id} className="mb-8">
              <h2 className="mb-3 text-[11px] uppercase tracking-[0.16em] text-umber">{c.name}</h2>
              <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
                {c.items.map(it => (
                  <li key={it.id} className="flex items-start justify-between px-5 py-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{it.name}</span>
                        {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                      </div>
                      {it.description ? <p className="mt-1 text-[11px] text-slate/60">{it.description}</p> : null}
                    </div>
                    <span className="ml-3 font-mono text-xs">{dollars(it.priceCents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        ))}

        {uncategorized.length > 0 ? (
          <section className="mb-8">
            <ul className="divide-y divide-slate/5 rounded-2xl border border-slate/10 bg-white">
              {uncategorized.map(it => (
                <li key={it.id} className="flex items-start justify-between px-5 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{it.name}</span>
                      {it.ageRestricted ? <span className="rounded-full bg-coral/10 px-2 text-[10px] text-coral">21+</span> : null}
                    </div>
                    {it.description ? <p className="mt-1 text-[11px] text-slate/60">{it.description}</p> : null}
                  </div>
                  <span className="ml-3 font-mono text-xs">{dollars(it.priceCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-10 border-t border-slate/5 pt-6 text-center text-[11px] tracking-wide text-slate/40">
          Powered by TabCall
        </footer>
      </div>
    </main>
  );
}
