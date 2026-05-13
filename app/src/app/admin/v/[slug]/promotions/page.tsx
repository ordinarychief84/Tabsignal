import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { PromotionsList } from "./promotions-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · promotions" };

export default async function PromotionsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/promotions`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const promotions = await db.promotion.findMany({
    where: { venueId: venue.id },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, priceCents: true } },
        },
      },
    },
  });

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Promotions</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Promotions</h1>
          <p className="mt-2 text-sm text-slate/60">
            Typed promos that show up across the guest UI: happy hour pills,
            full-width banners on the QR landing, or a &ldquo;new&rdquo; badge
            next to a menu item. Surfaces appropriately based on type.
          </p>
        </div>
        <Link
          href={`/admin/v/${params.slug}/promotions/new`}
          className="shrink-0 rounded-full bg-chartreuse px-4 py-1.5 text-sm font-medium text-slate hover:bg-chartreuse/90"
        >
          + New promotion
        </Link>
      </header>

      <PromotionsList
        slug={params.slug}
        initial={promotions.map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          type: p.type,
          bannerImageUrl: p.bannerImageUrl,
          startsAt: p.startsAt?.toISOString() ?? null,
          endsAt: p.endsAt?.toISOString() ?? null,
          status: p.status,
          itemCount: p.items.length,
        }))}
      />
    </>
  );
}
