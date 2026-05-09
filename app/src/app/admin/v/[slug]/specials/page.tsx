import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { SpecialsPanel } from "./specials-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — specials" };

export default async function SpecialsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/specials`);

  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const specials = await db.venueSpecial.findMany({
    where: { venueId: venue.id },
    orderBy: [{ active: "desc" }, { startsAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Promotions</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Specials</h1>
        <p className="mt-2 text-sm text-slate/60">
          Surface what&rsquo;s running tonight to every guest the moment they
          scan. Time-window or always-on. Toggle off when the keg blows; the
          system handles the rest.
        </p>
      </header>

      <SpecialsPanel
        slug={params.slug}
        initial={specials.map(s => ({
          id: s.id,
          title: s.title,
          description: s.description,
          priceCents: s.priceCents,
          startsAt: s.startsAt?.toISOString() ?? null,
          endsAt: s.endsAt?.toISOString() ?? null,
          active: s.active,
        }))}
      />
    </>
  );
}
