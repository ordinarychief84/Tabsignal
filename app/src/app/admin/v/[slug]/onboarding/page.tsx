import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · Set up your venue" };

/**
 * Server wrapper for the onboarding wizard. Fetches the venue's current
 * state (Stripe readiness, branding, tables, staff count, sentinel ZIP
 * "00000" left by /api/signup) so the wizard can decide which step the
 * user lands on and what to prefill.
 */
export default async function OnboardingPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/onboarding`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      zipCode: true,
      timezone: true,
      brandColor: true,
      logoUrl: true,
      guestWelcomeMessage: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      _count: { select: { tables: true, staff: true } },
    },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const stripeReady = Boolean(
    venue.stripeAccountId && venue.stripeChargesEnabled && venue.stripePayoutsEnabled,
  );

  return (
    <main className="min-h-screen bg-surface-warm text-slate">
      <header className="border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight">TabCall</span>
            <span className="hidden text-[12px] text-slate/45 sm:inline">· Onboarding</span>
          </Link>
          <Link
            href={`/admin/v/${venue.slug}`}
            className="text-[12px] text-slate/55 hover:text-slate sm:text-sm"
          >
            Skip to dashboard →
          </Link>
        </div>
      </header>

      <OnboardingWizard
        slug={venue.slug}
        venueName={venue.name}
        zipCode={venue.zipCode}
        timezone={venue.timezone}
        brandColor={venue.brandColor}
        logoUrl={venue.logoUrl}
        welcomeMessage={venue.guestWelcomeMessage}
        tableCount={venue._count.tables}
        staffCount={venue._count.staff}
        stripeReady={stripeReady}
        stripeAttached={Boolean(venue.stripeAccountId)}
      />
    </main>
  );
}
