import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { PromotionForm } from "../promotion-form";
import { PageHeader } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · new promotion" };

export default async function NewPromotionPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/promotions/new`);
  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) return null;

  return (
    <>
      <PageHeader
        eyebrow="Promotions"
        backHref={`/admin/v/${params.slug}/promotions`}
        title="New promotion"
      />
      <PromotionForm slug={params.slug} mode="create" />
    </>
  );
}
