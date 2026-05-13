import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { ContactPanel } from "./contact-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · book a setup call" };

const VALID_PLANS = new Set(["growth", "pro"]);

export default async function UpgradeContactPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { plan?: string; sent?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/billing/upgrade-contact`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true, name: true, slug: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const planId = (searchParams.plan ?? "").toLowerCase();
  const plan = VALID_PLANS.has(planId) ? planId : "growth";
  const planLabel = plan === "pro" ? "Pro" : "Growth";

  return (
    <>
      <header className="mb-6">
        <Link
          href={`/admin/v/${params.slug}/billing`}
          className="text-[12px] text-umber hover:underline"
        >
          ← back to billing
        </Link>
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-umber">Concierge</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">
          Book a 15-minute setup call.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate/60">
          We onboard every <strong>{planLabel}</strong> venue ourselves to make
          sure your menu, staff, and Stripe Connect are dialed in before your
          first paid tab. After the call we&rsquo;ll switch you to {planLabel}{" "}
          immediately. No extra steps.
        </p>
      </header>

      <ContactPanel
        slug={params.slug}
        venueName={venue.name}
        plan={plan as "growth" | "pro"}
        sent={searchParams.sent === "1"}
      />
    </>
  );
}
