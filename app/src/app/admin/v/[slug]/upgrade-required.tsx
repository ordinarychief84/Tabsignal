import Link from "next/link";
import { type PlanId, planById } from "@/lib/plans";

type Props = {
  slug: string;
  feature: string;
  current: PlanId;
  required: PlanId;
};

/**
 * In-place paywall for plan-locked admin pages. Sells the tier rather
 * than just naming it: price, the full feature list they'd unlock, and
 * a direct path to checkout on the billing page.
 */
export function UpgradeRequired({ slug, feature, current, required }: Props) {
  const requiredPlan = planById(required);
  const currentPlan = planById(current);
  const price = requiredPlan ? `$${(requiredPlan.monthlyCents / 100).toFixed(0)}/mo` : null;
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-slate/15 bg-white p-8 text-center">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
        {requiredPlan?.name ?? required} feature
      </p>
      <h2 className="mt-2 text-2xl font-medium tracking-tight">
        {feature} unlocks on {requiredPlan?.name ?? required}
      </h2>
      <p className="mt-3 text-sm text-slate/60">
        You&rsquo;re on <strong>{currentPlan?.name ?? current}</strong>.
        {price ? (
          <> {requiredPlan?.name} is {price} and includes:</>
        ) : null}
      </p>
      {requiredPlan ? (
        <ul className="mx-auto mt-4 inline-block space-y-1.5 text-left text-sm text-slate/75">
          {requiredPlan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-sea">✓</span>
              {f}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/admin/v/${slug}/billing`}
          className="rounded-full bg-slate px-6 py-2.5 text-sm font-medium text-oat hover:bg-slate/90"
        >
          Upgrade to {requiredPlan?.name ?? required} →
        </Link>
        <Link
          href={`/admin/v/${slug}/billing/upgrade-contact?plan=${required}`}
          className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
        >
          Talk to us first
        </Link>
      </div>
    </section>
  );
}
