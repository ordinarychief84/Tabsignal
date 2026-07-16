import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaff } from "@/lib/auth/operator";
import { meetsAtLeast, planFromOrg, trialDaysLeft } from "@/lib/plans";
import { AdminShell, type NavGroup } from "@/components/admin/sidebar";
import { StopImpersonationBanner } from "./stop-impersonation-banner";

export const dynamic = "force-dynamic";

/**
 * Venue owner dashboard shell — the same SaaS AdminShell the operator
 * console uses, so the two admin surfaces share one visual language.
 * Plan-gated sections carry a lock badge (Growth/Pro) and dim; the
 * destination page still renders its own upgrade prompt.
 */
function venueNav(slug: string, paid: boolean, pro: boolean): NavGroup[] {
  const growthLock = paid ? null : "Growth";
  const proLock = pro ? null : "Pro";
  const base = `/admin/v/${slug}`;
  return [
    {
      heading: "Operations",
      items: [
        { href: base, label: "Dashboard", exact: true },
        { href: `${base}/requests`, label: "Live requests" },
        { href: `${base}/orders`, label: "Orders" },
        { href: `${base}/bills`, label: "Bills" },
        { href: `${base}/analytics`, label: "Analytics", locked: growthLock },
      ],
    },
    {
      heading: "Menu & offers",
      items: [
        { href: `${base}/menu`, label: "Menu", locked: growthLock },
        { href: `${base}/specials`, label: "Specials" },
        { href: `${base}/promotions`, label: "Promotions" },
      ],
    },
    {
      heading: "Guests",
      items: [
        { href: `${base}/reservations`, label: "Reservations", locked: proLock },
        { href: `${base}/regulars`, label: "Regulars", locked: proLock },
        { href: `${base}/reviews`, label: "Reviews" },
      ],
    },
    {
      heading: "Team",
      items: [
        { href: `${base}/staff`, label: "People" },
        { href: `${base}/tips`, label: "Tips", locked: growthLock },
        { href: `${base}/audit`, label: "Audit log" },
      ],
    },
    {
      heading: "Setup",
      items: [
        { href: `${base}/tables`, label: "Tables" },
        { href: `${base}/qr-tents`, label: "QR tents" },
        { href: `${base}/pos`, label: "POS" },
        { href: `${base}/branding`, label: "Branding" },
        { href: `${base}/billing`, label: "Billing" },
        { href: `${base}/settings`, label: "Settings" },
      ],
    },
  ];
}

export default async function AdminVenueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = await getStaffSession();
  if (!session) {
    const reachedPath = headers().get("x-pathname") ?? `/admin/v/${params.slug}`;
    redirect(`/staff/login?next=${encodeURIComponent(reachedPath)}`);
  }

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } },
    },
  });
  if (!venue) notFound();
  if (venue.id !== session.venueId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-oat px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-medium text-slate">That isn&rsquo;t your venue.</h1>
          <p className="mt-3 text-sm text-slate/60">
            You&rsquo;re signed in to a different venue. Sign out to switch.
          </p>
          <form action="/api/auth/logout" method="post" className="mt-6">
            <button
              type="submit"
              className="rounded-lg border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate hover:text-oat"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const orgPlan = planFromOrg(venue.org);
  const isPaidPlan = meetsAtLeast(orgPlan, "growth");
  const isProPlan = meetsAtLeast(orgPlan, "pro");
  const platformTrialDays = trialDaysLeft(venue.org);
  const planLabel = orgPlan === "pro" ? "Pro plan" : orgPlan === "growth" ? "Growth plan" : "Starter plan";

  // Impersonation banner: platform-staff session on a staff row whose
  // email differs from the operator's own (see /api/operator/impersonate).
  let impersonating = false;
  if (isPlatformStaff(session)) {
    const staffRow = await db.staffMember.findUnique({
      where: { id: session.staffId },
      select: { email: true },
    });
    if (staffRow && staffRow.email.toLowerCase() !== session.email.toLowerCase()) {
      impersonating = true;
    }
  }

  const navTop =
    platformTrialDays !== null ? (
      <Link
        href={`/admin/v/${params.slug}/billing`}
        className="block rounded-lg border border-chartreuse/40 bg-chartreuse/10 px-3 py-2"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-chartreuse">Growth trial</p>
        <p className="mt-0.5 text-[12px] font-medium text-oat">
          {platformTrialDays === 1 ? "Ends today" : `${platformTrialDays} days left`} · keep it →
        </p>
      </Link>
    ) : !isPaidPlan ? (
      <Link
        href={`/admin/v/${params.slug}/billing`}
        className="block rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oat/50">Starter plan</p>
        <p className="mt-0.5 text-[12px] font-medium text-oat">Unlock menu + analytics →</p>
      </Link>
    ) : null;

  return (
    <AdminShell
      brand={{ href: `/admin/v/${params.slug}`, name: "TabCall" }}
      context={{ label: venue.name, sublabel: planLabel }}
      navTop={navTop}
      groups={venueNav(params.slug, isPaidPlan, isProPlan)}
      account={{ email: session.email, changePasswordHref: "/admin/account/password" }}
    >
      {impersonating ? <StopImpersonationBanner operatorEmail={session.email} /> : null}
      {children}
    </AdminShell>
  );
}
