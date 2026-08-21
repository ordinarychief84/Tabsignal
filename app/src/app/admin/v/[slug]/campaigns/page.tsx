import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { previewAudience, messagingConfigured } from "@/lib/campaigns";
import { PageHeader } from "@/components/admin/ui";
import { CampaignsPanel } from "./campaigns-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · campaigns" };

/**
 * Campaigns.
 *
 * Composing, scheduling and audience sizing all work against real consent
 * records. Sending does not — there is no SMS provider connected — and the
 * page says so plainly rather than showing a button that quietly does
 * nothing. An owner should never be left wondering whether a message went
 * out.
 */
export default async function CampaignsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/campaigns`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const [campaigns, all, recent, returning] = await Promise.all([
    db.campaign.findMany({
      where: { venueId: venue.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, message: true, audienceType: true, status: true,
        scheduledAt: true, sentAt: true, createdAt: true,
        _count: { select: { recipients: true } },
      },
    }),
    previewAudience(venue.id, "ALL_SUBSCRIBED"),
    previewAudience(venue.id, "VISITED_LAST_30_DAYS"),
    previewAudience(venue.id, "RETURNING_GUESTS"),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Relationship"
        title="Campaigns"
        subtitle="Messages to guests who opted in. Nobody else is ever included."
        backHref={`/admin/v/${params.slug}`}
      />
      <CampaignsPanel
        slug={params.slug}
        venueName={venue.name}
        messagingConfigured={messagingConfigured()}
        audiences={[all, recent, returning].map(a => ({
          audience: a.audience,
          count: a.count,
        }))}
        campaigns={campaigns.map(c => ({
          id: c.id,
          name: c.name,
          message: c.message,
          audienceType: c.audienceType,
          status: c.status,
          scheduledAt: c.scheduledAt?.toISOString() ?? null,
          sentAt: c.sentAt?.toISOString() ?? null,
          recipients: c._count.recipients,
        }))}
      />
    </>
  );
}
