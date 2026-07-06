import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { PLANS, planFromOrg, planById, trialDaysLeft } from "@/lib/plans";
import { BillingPanel } from "./billing-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · billing" };

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { checkout?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/billing`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    include: { org: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  // Single source of truth for "what plan are they actually on" —
  // honors subscription status (CANCELED ≠ still paid) and card-less
  // platform trials, unlike a bare priceId lookup.
  const currentPlan = planFromOrg(venue.org);
  const platformTrialDays = trialDaysLeft(venue.org);

  return (
    <>
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Plan</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Billing</h1>
        <p className="mt-2 text-sm text-slate/60">
          You&rsquo;re on the <strong>{planById(currentPlan)?.name ?? currentPlan}</strong> plan
          {platformTrialDays !== null ? <> (free trial)</> : null}.
          {venue.org.subscriptionPeriodEnd ? (
            <> Renews {new Date(venue.org.subscriptionPeriodEnd).toLocaleDateString()}.</>
          ) : null}
        </p>
        {searchParams.checkout === "success" ? (
          <p className="mt-3 rounded-lg border border-chartreuse/40 bg-chartreuse/10 px-3 py-2 text-xs text-slate/80">
            Subscription started. May take a moment to reflect.
          </p>
        ) : null}
        {searchParams.checkout === "canceled" ? (
          <p className="mt-3 rounded-lg border border-slate/15 bg-white px-3 py-2 text-xs text-slate/60">
            Checkout canceled. No changes made.
          </p>
        ) : null}
      </header>

      <BillingPanel
        slug={params.slug}
        currentPlanId={currentPlan}
        plans={PLANS.map(p => ({
          id: p.id,
          name: p.name,
          monthlyCents: p.monthlyCents,
          tagline: p.tagline,
          features: p.features,
          configured: p.id === "free" ? true : !!p.stripePriceId,
        }))}
        hasSubscription={!!venue.org.subscriptionPriceId}
        status={venue.org.subscriptionStatus}
        trialEndsAt={venue.org.trialEndsAt?.toISOString() ?? null}
        platformTrialDays={platformTrialDays}
      />
    </>
  );
}
