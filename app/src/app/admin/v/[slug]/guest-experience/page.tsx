import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { visitProgramFrom } from "@/lib/visit-progress";
import { serviceThresholdsFrom } from "@/lib/service-sla";
import { guestExperienceFrom } from "@/lib/guest-experience";
import { CONSENT_TEXT_VERSION, consentText } from "@/lib/consent";
import { messagingConfigured } from "@/lib/campaigns";
import { PageHeader } from "@/components/admin/ui";
import { GuestExperienceForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · guest experience" };

/**
 * What a guest sees, and what the venue asks them for.
 *
 * Everything defaults on, so this page is about switching things OFF
 * deliberately — a venue shouldn't have to opt in to its own product.
 */
export default async function GuestExperiencePage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/guest-experience`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, enabledFeatures: true, guestWelcomeMessage: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="Guest experience"
        subtitle="What guests see when they scan, and what you ask them for."
        backHref={`/admin/v/${params.slug}`}
      />
      <GuestExperienceForm
        slug={params.slug}
        config={guestExperienceFrom(venue.enabledFeatures)}
        welcomeMessage={venue.guestWelcomeMessage ?? ""}
        consentPreview={consentText(venue.name)}
        consentVersion={CONSENT_TEXT_VERSION}
        visitProgram={visitProgramFrom(venue.enabledFeatures)}
      serviceThresholds={serviceThresholdsFrom(venue.enabledFeatures)}
      messagingConfigured={messagingConfigured()}
      />
    </>
  );
}
