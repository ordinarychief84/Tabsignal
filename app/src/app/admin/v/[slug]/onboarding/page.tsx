import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { OnboardingPanel } from "./onboarding-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · onboarding" };

export default async function OnboardingPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/onboarding`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      _count: { select: { tables: true, staff: true } },
    },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const stripeReady =
    venue.stripeAccountId && venue.stripeChargesEnabled && venue.stripePayoutsEnabled;
  // 1 staff = the owner only. Anything else means they invited someone.
  const hasInvitedStaff = venue._count.staff > 1;
  const hasTables = venue._count.tables > 0;

  return (
    <main className="min-h-screen bg-oat text-slate">
      <header className="border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight">TabCall</span>
          </Link>
          <Link
            href={`/admin/v/${venue.slug}`}
            className="text-xs text-slate/50 hover:text-slate"
          >
            Skip to dashboard →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Welcome</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Set up {venue.name}.</h1>
        <p className="mt-3 text-sm text-slate/60">
          Three quick steps. You&rsquo;re live the moment you finish Stripe.
          You can come back to anything you skip from Settings.
        </p>

        <div className="mt-8">
          <OnboardingPanel
            slug={venue.slug}
            initialStripeReady={!!stripeReady}
            initialStripeAttached={!!venue.stripeAccountId}
            initialHasInvitedStaff={hasInvitedStaff}
            initialHasTables={hasTables}
            tableCount={venue._count.tables}
          />
        </div>
      </div>
    </main>
  );
}
