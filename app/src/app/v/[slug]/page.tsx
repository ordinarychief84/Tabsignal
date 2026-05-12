import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function VenueRootPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      brandColor: true,
      logoUrl: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) notFound();

  const plan = planFromOrg(venue.org);
  const hasMenu = meetsAtLeast(plan, "growth");
  const hasReservations = meetsAtLeast(plan, "pro");

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto max-w-md px-6 py-12">
        <header className="mb-8 flex flex-col items-center text-center">
          {venue.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={venue.logoUrl}
              alt={`${venue.name} logo`}
              className="mb-5 h-16 w-16 rounded-2xl object-cover"
            />
          ) : null}
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Welcome</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">{venue.name}</h1>
        </header>

        <section className="rounded-2xl border border-slate/10 bg-white px-6 py-6 text-center text-sm leading-relaxed text-slate/70">
          You&rsquo;re at <span className="font-medium text-slate">{venue.name}</span>.
          Scan the QR on your table to call your server or open your tab.
        </section>

        {(hasMenu || hasReservations) ? (
          <section className="mt-6 space-y-3">
            {hasMenu ? (
              <Link
                href={`/v/${params.slug}/menu`}
                className="flex items-center justify-between rounded-2xl border border-slate/10 bg-white px-5 py-4 text-sm transition-colors hover:border-slate/30"
              >
                <span>
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-umber">
                    Browse
                  </span>
                  <span className="mt-1 block font-medium text-slate">Menu</span>
                </span>
                <span aria-hidden className="text-slate/40">→</span>
              </Link>
            ) : null}
            {hasReservations ? (
              <Link
                href={`/v/${params.slug}/reservations`}
                className="flex items-center justify-between rounded-2xl border border-slate/10 bg-white px-5 py-4 text-sm transition-colors hover:border-slate/30"
              >
                <span>
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-umber">
                    Book
                  </span>
                  <span className="mt-1 block font-medium text-slate">Reservations</span>
                </span>
                <span aria-hidden className="text-slate/40">→</span>
              </Link>
            ) : null}
          </section>
        ) : null}

        <footer className="mt-12 border-t border-slate/5 pt-6 text-center text-[11px] tracking-wide text-slate/40">
          Powered by TabCall
        </footer>
      </div>
    </main>
  );
}
