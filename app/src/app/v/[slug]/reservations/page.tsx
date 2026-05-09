import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { ReservationForm } from "./reservation-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a table" };

export default async function GuestReservationsPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      name: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
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
