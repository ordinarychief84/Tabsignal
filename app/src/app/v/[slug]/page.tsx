import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { getVenueBranding, resolveBrandingWithFallback } from "@/lib/branding";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { name: true } });
  if (!venue) return {};
  return {
    // `absolute` so the site-wide "%s | TabCall" template doesn't append
    // our name to the venue's own public page. This page belongs to them.
    //
    // It also no longer says "Pay": guest payments were removed in #86,
    // and the venue's POS takes the money. Promising it here would have
    // been the first thing a guest read and the first thing that turned
    // out to be untrue.
    title: { absolute: `${venue.name} — Menu & Service` },
    description: `You're at ${venue.name}. Scan the QR on your table to browse the menu, see tonight's specials and call your server.`,
    alternates: { canonical: `${SITE_URL}/v/${params.slug}` },
  };
}

export default async function VenueRootPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      brandColor: true,
      logoUrl: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } },
    },
  });
  if (!venue) notFound();

  const plan = planFromOrg(venue.org);
  const hasMenu = meetsAtLeast(plan, "growth");
  const hasReservations = meetsAtLeast(plan, "pro");

  // VenueBranding overrides win; legacy Venue fields are the fallback
  // (restructure P3.3).
  const branding = resolveBrandingWithFallback(
    { brandColor: venue.brandColor, logoUrl: venue.logoUrl, guestWelcomeMessage: null },
    await getVenueBranding(venue.id),
  );

  return (
    <main className="min-h-screen bg-oat text-slate">
      <div className="mx-auto max-w-md px-6 py-12">
        <header className="mb-8 flex flex-col items-center text-center">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
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
