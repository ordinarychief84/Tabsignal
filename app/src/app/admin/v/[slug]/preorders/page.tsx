import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { gateAdminRoute } from "@/lib/plan-gate";
import { planFromOrg } from "@/lib/plans";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { UpgradeRequired } from "../upgrade-required";
import { PreOrdersPanel } from "./preorders-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · pre-orders" };

/**
 * Pre-order pickup queue.
 *
 * The API for this — GET /preorders and PATCH /preorders/[id] — has been
 * complete for a while, right down to a comment saying "the PWA polls
 * every 5s". Nothing ever called it. Venues on Growth could take and
 * charge for pre-orders and then had no screen on which to mark one ready
 * or handed over, so the pickup code the guest was shown meant nothing to
 * anyone behind the counter.
 *
 * Same Growth gate as the API, and gated on `preorders.manage`, which
 * already existed in the permission matrix and had no page behind it.
 */
export default async function PreOrdersPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/preorders`);

  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "preorders.manage")) redirect(`/admin/v/${params.slug}`);

  const gate = await gateAdminRoute(params.slug, "growth");
  if (!gate.ok) {
    // Resolve the venue's actual plan so the paywall can name it.
    const venue = await db.venue.findUnique({
      where: { slug: params.slug },
      select: { org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } } },
    });
    if (!venue) return null;
    return (
      <>
        <PageHeader eyebrow="Counter" title="Pre-orders" />
        <UpgradeRequired
          slug={params.slug}
          feature="Pre-order pickup queue"
          current={planFromOrg(venue.org)}
          required="growth"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Counter"
        title="Pre-orders"
        subtitle="Paid and waiting. Match the pickup code the guest shows you, then hand it over."
      />
      <PreOrdersPanel slug={params.slug} />
    </>
  );
}
