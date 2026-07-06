import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { SITE_URL } from "@/lib/seo";
import { ReservationForm } from "./reservation-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { name: true } });
  if (!venue) return { title: "Book a table" };
  return {
    title: `Book a Table at ${venue.name}`,
    description: `Reserve a table at ${venue.name} online — pick a time and party size, get an instant SMS confirmation. Powered by TabCall.`,
    alternates: { canonical: `${SITE_URL}/v/${params.slug}/reservations` },
  };
}

export default async function GuestReservationsPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      name: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } },
    },
  });
  if (!venue) notFound();
  if (!meetsAtLeast(planFromOrg(venue.org), "pro")) notFound();

  return (
    <main className="min-h-screen bg-oat px-6 py-10 text-slate">
      <div className="mx-auto max-w-md">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Book a table</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">{venue.name}</h1>
        <p className="mt-2 text-sm text-slate/60">
          Reserve in advance. We&rsquo;ll text a confirmation.
        </p>
        <div className="mt-6">
          <ReservationForm slug={params.slug} />
        </div>
      </div>
    </main>
  );
}
