import Link from "next/link";
import { type PlanId, planById } from "@/lib/plans";

type Props = {
  slug: string;
  feature: string;
  current: PlanId;
  required: PlanId;
};

export function UpgradeRequired({ slug, feature, current, required }: Props) {
  const requiredPlan = planById(required);
  const currentPlan = planById(current);
  return (
    <section className="rounded-2xl border border-slate/15 bg-white p-8 text-center">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Locked</p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight">{feature} is on {requiredPlan?.name ?? required}</h2>
      <p className="mt-3 text-sm text-slate/60">
        You&rsquo;re on the <strong>{currentPlan?.name ?? current}</strong> plan.
        Upgrade to unlock {feature.toLowerCase()} and the rest of the {requiredPlan?.name ?? required} feature set.
      </p>
      <Link
        href={`/admin/v/${slug}/billing`}
        className="mt-6 inline-block rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
      >
        See plans
      </Link>
    </section>
  );
}
