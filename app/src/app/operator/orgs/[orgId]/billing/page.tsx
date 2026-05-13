import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess } from "@/lib/operator-rbac";
import { PLANS, planByPriceId } from "@/lib/plans";
import { BillingFlipPanel } from "./billing-flip-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · flip plan" };

export default async function OrgBillingPage({ params }: { params: { orgId: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/operator/orgs/${params.orgId}/billing`);
  const access = await checkOrgAccess(session, params.orgId);
  if (!access.ok) redirect("/operator");

  const org = await db.organization.findUnique({
    where: { id: params.orgId },
    select: {
      id: true,
      name: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
      subscriptionPriceId: true,
      subscriptionPeriodEnd: true,
      trialEndsAt: true,
    },
  });
  if (!org) redirect("/operator");

  const currentPlanId = org.subscriptionPriceId
    ? planByPriceId(org.subscriptionPriceId) ?? "free"
    : "free";

  return (
    <>
      <header className="mb-6">
        <Link href={`/operator/orgs/${params.orgId}`} className="text-[12px] text-umber hover:underline">
          ← back to org
        </Link>
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-umber">Plan</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Flip {org.name}&rsquo;s plan</h1>
        <p className="mt-2 max-w-md text-sm text-slate/60">
          Promote or demote this org&rsquo;s subscription tier after a setup call.
          This records intent in our DB only. Pair with a Stripe Subscription on
          their Customer record so the next cycle actually charges.
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <Stat label="Current plan" value={currentPlanId} />
        <Stat label="Status" value={org.subscriptionStatus.toLowerCase()} />
        <Stat label="Stripe customer" value={org.stripeCustomerId ?? "—"} mono />
        <Stat label="Trial ends" value={org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : "—"} />
      </section>

      <BillingFlipPanel
        orgId={params.orgId}
        currentPlanId={currentPlanId}
        currentStatus={org.subscriptionStatus}
        plans={PLANS.map(p => ({
          id: p.id,
          name: p.name,
          monthlyCents: p.monthlyCents,
          configured: p.id === "free" ? true : !!p.stripePriceId,
        }))}
      />
    </>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate/10 bg-white p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      <p className={["mt-1 text-base", mono ? "font-mono text-sm" : "font-medium"].join(" ")}>{value}</p>
    </div>
  );
}
