import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator } from "@/lib/auth/operator";
import { meetsAtLeast, planFromOrg } from "@/lib/plans";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminVenueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = await getStaffSession();
  if (!session) {
    // Preserve the full path the user was trying to reach (e.g.
    // .../billing/upgrade-contact) so post-login they land where they
    // started, not on the dashboard. Falls back to the venue dashboard
    // if middleware hasn't stamped the header (shouldn't happen).
    const reachedPath = headers().get("x-pathname") ?? `/admin/v/${params.slug}`;
    redirect(`/staff/login?next=${encodeURIComponent(reachedPath)}`);
  }

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      name: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) notFound();
  if (venue.id !== session.venueId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-oat px-6 text-center">
        <div className="max-w-sm">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium text-slate">
            That isn&rsquo;t your venue.
          </h1>
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

  const operator = isOperator(session);
  const orgPlan = planFromOrg(venue.org);
  const isPaidPlan = meetsAtLeast(orgPlan, "growth");
  const isProPlan = meetsAtLeast(orgPlan, "pro");

  return (
    <div className="flex min-h-screen flex-col bg-oat text-slate md:flex-row">
      <aside className="border-b border-slate/10 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-6 py-5 md:flex-col md:items-stretch md:gap-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#C9F61C" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#C9F61C" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight text-slate">TabCall</span>
          </Link>
          <div className="text-right md:text-left">
            <p className="text-[10px] uppercase tracking-[0.18em] text-umber">Venue</p>
            <p className="truncate text-sm font-medium text-slate">{venue.name}</p>
          </div>
        </div>
        <AdminNav slug={params.slug} operator={operator} isPaidPlan={isPaidPlan} isProPlan={isProPlan} />
        <div className="hidden md:block md:px-6 md:py-6">
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full rounded-lg border border-slate/15 py-2 text-xs font-medium text-slate/70 hover:text-slate"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
