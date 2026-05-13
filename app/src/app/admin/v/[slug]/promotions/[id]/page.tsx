import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { PromotionForm } from "../promotion-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — edit promotion" };

export default async function EditPromotionPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/promotions/${params.id}`);
  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  const promotion = await db.promotion.findUnique({
    where: { id: params.id },
    include: { items: { select: { menuItemId: true } } },
  });
  if (!promotion || promotion.venueId !== venue.id) notFound();

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Promotions</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Edit promotion</h1>
      </header>
      <PromotionForm
        slug={params.slug}
        mode="edit"
        initial={{
          id: promotion.id,
          title: promotion.title,
          description: promotion.description,
          type: promotion.type,
          bannerImageUrl: promotion.bannerImageUrl,
          startsAt: promotion.startsAt?.toISOString() ?? null,
          endsAt: promotion.endsAt?.toISOString() ?? null,
          status: promotion.status,
          menuItemIds: promotion.items.map(it => it.menuItemId),
        }}
      />
    </>
  );
}
