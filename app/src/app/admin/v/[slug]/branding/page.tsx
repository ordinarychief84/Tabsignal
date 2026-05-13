import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { getVenueBranding } from "@/lib/branding";
import { BrandingEditor } from "./branding-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · branding" };

export default async function BrandingPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/branding`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      brandColor: true,
      logoUrl: true,
      guestWelcomeMessage: true,
    },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const branding = await getVenueBranding(venue.id);

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Look &amp; feel</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Branding</h1>
        <p className="mt-2 text-sm text-slate/60">
          Layer custom colors, a banner, and a font on top of the basics from Settings.
          Empty fields fall back to your existing brand color and logo.
        </p>
      </header>

      <BrandingEditor
        slug={params.slug}
        venueName={venue.name}
        legacy={{
          brandColor: venue.brandColor,
          logoUrl: venue.logoUrl,
          guestWelcomeMessage: venue.guestWelcomeMessage,
        }}
        initial={{
          logoUrl: branding?.logoUrl ?? null,
          bannerImageUrl: branding?.bannerImageUrl ?? null,
          primaryColor: branding?.primaryColor ?? null,
          secondaryColor: branding?.secondaryColor ?? null,
          accentColor: branding?.accentColor ?? null,
          fontFamily: branding?.fontFamily ?? null,
          welcomeMessage: branding?.welcomeMessage ?? null,
        }}
      />
    </>
  );
}
