import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { readOnboardingState, deriveOnboarding } from "@/lib/onboarding";
import { Launchpad } from "./launchpad";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · launch your venue" };

/**
 * Onboarding launchpad — the guided path from "account created" to
 * "guests are tapping". Replaces the scrapped modal wizard with a
 * checklist the owner can leave and resume from any device: every
 * check-off persists to Venue.onboardingState server-side.
 *
 * Auth is enforced by the /admin/v/[slug] layout (session + venue
 * ownership); this page only assembles step status.
 */
export default async function OnboardingPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      venueType: true,
      brandColor: true,
      guestWelcomeMessage: true,
      onboardingState: true,
      onboardingCompletedAt: true,
      stripeChargesEnabled: true,
      stripeAccountId: true,
      _count: {
        select: {
          tables: true,
          staff: { where: { status: { in: ["ACTIVE", "INVITED"] } } },
        },
      },
    },
  });
  if (!venue) notFound();

  const state = readOnboardingState(venue.onboardingState);
  const progress = deriveOnboarding({
    state,
    venueType: venue.venueType,
    brandColor: venue.brandColor,
    staffCount: venue._count.staff,
    stripeChargesEnabled: venue.stripeChargesEnabled,
    onboardingCompletedAt: venue.onboardingCompletedAt,
  });

  // First table's QR link so "preview what guests see" works pre-launch.
  const firstTable = await db.table.findFirst({
    where: { venueId: venue.id },
    orderBy: { label: "asc" },
    select: { label: true, qrToken: true },
  });

  return (
    <Launchpad
      slug={venue.slug}
      venueName={venue.name}
      initialState={state}
      initialProgress={progress}
      venueType={venue.venueType}
      brandColor={venue.brandColor}
      welcomeMessage={venue.guestWelcomeMessage}
      tableCount={venue._count.tables}
      staffCount={venue._count.staff}
      stripeChargesEnabled={venue.stripeChargesEnabled}
      stripeStarted={!!venue.stripeAccountId}
      previewPath={
        firstTable
          ? `/v/${venue.slug}/t/${encodeURIComponent(firstTable.label)}?s=${encodeURIComponent(firstTable.qrToken)}`
          : null
      }
    />
  );
}
