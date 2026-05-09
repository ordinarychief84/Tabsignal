import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";
import { planById } from "@/lib/plans";

const Body = z.object({
  // Plan to set. "free" implicitly clears the subscription.
  planId: z.enum(["free", "growth", "pro"]),
  // Subscription state — defaults are sane for an operator-flipped account.
  status: z.enum(["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]).optional(),
  // Optional: ISO date for trial end / period end.
  trialEndsAt: z.string().datetime().nullable().optional(),
  // Free-text reason logged for the audit trail.
  reason: z.string().max(500).optional(),
});

/**
 * Operator-only: flip an org's subscription tier without going through
 * Stripe Checkout. This is what closes the concierge loop — after a
 * 15-min setup call, the founder bumps the org from Starter to
 * Growth/Pro here.
 *
 * NOTE: this does NOT charge the org via Stripe; it just records the
 * intended state in our DB. Pair with a Stripe Subscription created
 * out-of-band (Dashboard → Customer → Add subscription) so the next
 * billing cycle actually invoices. The Stripe webhook will refresh
 * subscriptionPriceId / subscriptionPeriodEnd when that subscription
 * fires its next event.
 */
export async function PATCH(req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });
  if (!canBroadcast(access.role)) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Promoting an org's plan requires OWNER or ADMIN." }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" }, { status: 400 });
  }

  const plan = planById(parsed.planId);
  if (!plan) return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });

  // For free, clear the subscription state. For paid, default to ACTIVE
  // unless caller explicitly chose TRIALING/PAST_DUE/etc.
  const status = parsed.status ?? (parsed.planId === "free" ? "NONE" : "ACTIVE");

  const updated = await db.organization.update({
    where: { id: ctx.params.orgId },
    data: {
      subscriptionStatus: status,
      subscriptionPriceId: parsed.planId === "free" ? null : (plan.stripePriceId ?? null),
      trialEndsAt: parsed.trialEndsAt === undefined ? undefined : (parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null),
    },
    select: { id: true, name: true, subscriptionStatus: true, subscriptionPriceId: true, trialEndsAt: true },
  });

  // Audit trail: console for now. Persist to a real AuditLog table when
  // the volume of these matters for support disputes.
  console.info(
    `[operator:plan-flip] orgId=${ctx.params.orgId} plan=${parsed.planId} status=${status} ` +
    `by=${session?.email ?? "?"}${parsed.reason ? ` reason="${parsed.reason}"` : ""}`
  );

  return NextResponse.json({
    org: updated,
    plan: parsed.planId,
    note: parsed.planId !== "free" && !plan.stripePriceId
      ? "Plan flipped, but STRIPE_PRICE_" + parsed.planId.toUpperCase() + " env is unset — billing won't actually charge until that's configured."
      : null,
  });
}
