import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { PromotionForm } from "../promotion-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · new promotion" };

export default async function NewPromotionPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/promotions/new`);
  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Promotions</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">New promotion</h1>
      </header>
      <PromotionForm slug={params.slug} mode="create" />
    </>
  );
}
