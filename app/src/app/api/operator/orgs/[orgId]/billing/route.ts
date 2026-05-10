import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess } from "@/lib/operator-rbac";
import { isPlatformStaff } from "@/lib/auth/operator";
import { planById } from "@/lib/plans";
import { sendEmail } from "@/lib/email/send";
import { orgAlertRecipients } from "@/lib/email/recipients";

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
  // Plan-flip is platform-staff only. Allowing OrgMember OWNER/ADMIN here was
  // a privilege-escalation hole: signup auto-grants the new owner OWNER, which
  // would let any self-serve venue immediately PATCH themselves to "pro" for
  // free. Only TabCall internal staff (isPlatformStaff via OPERATOR_EMAILS or
  // a PLATFORM org membership) may bump a plan via this endpoint.
  if (!session || !isPlatformStaff(session)) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Plan changes are issued by TabCall staff only." },
      { status: 403 },
    );
  }
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });

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

  // Notify the org's alert recipients that their plan changed. This is
  // the post-call confirmation: the founder flips them after the call,
  // and within seconds they get an email saying "you're on Growth now,
  // here's what unlocked."
  void notifyPlanChange({
    org: updated,
    planId: parsed.planId,
    status,
    operatorEmail: session?.email ?? null,
  }).catch(err => console.warn("[plan-flip] notify failed", err));

  return NextResponse.json({
    org: updated,
    plan: parsed.planId,
    note: parsed.planId !== "free" && !plan.stripePriceId
      ? "Plan flipped, but STRIPE_PRICE_" + parsed.planId.toUpperCase() + " env is unset — billing won't actually charge until that's configured."
      : null,
  });
}

async function notifyPlanChange(args: {
  org: { id: string; name: string };
  planId: "free" | "growth" | "pro";
  status: string;
  operatorEmail: string | null;
}): Promise<void> {
  const recipients = await orgAlertRecipients(args.org.id);
  if (recipients.length === 0) return;

  const planLabel = args.planId === "free" ? "Starter" : args.planId === "growth" ? "Growth" : "Pro";
  const perks = args.planId === "pro"
    ? "Multi-location operator console, regulars dossier, custom branding, reservations, loyalty, benchmarking."
    : args.planId === "growth"
    ? "Menu management, pre-order at QR, analytics, bill split, tip pooling, unlimited staff."
    : "Realtime request queue + AI bad-rating intercept. 0.5% per transaction, no monthly fee.";
  const subject = `[${args.org.name}] Plan updated → ${planLabel}`;
  const html = `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;color:#0E0F1A;background:#F8F6F1;">
      <tr><td style="padding:24px;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8B6F4E;">${escapeHtml(args.org.name)}</p>
        <h2 style="margin:0 0 12px;font-weight:500;">You&rsquo;re on ${escapeHtml(planLabel)} now.</h2>
        <p style="margin:0 0 12px;color:#0E0F1A;">Status: <strong>${escapeHtml(args.status.toLowerCase())}</strong>.</p>
        <p style="margin:0 0 16px;color:#0E0F1A;">${escapeHtml(perks)}</p>
        <p style="margin:0 0 12px;font-size:13px;color:#8B6F4E;">
          ${args.planId !== "free"
            ? "Reach out if anything looks wrong — flipping a plan in the operator console doesn&rsquo;t auto-charge; we&rsquo;ll handle Stripe Subscription setup separately."
            : "You&rsquo;ve been moved back to the Starter tier. Realtime queue + bad-rating intercept stay on; everything else gates back."
          }
        </p>
        <p style="margin:24px 0 0;font-size:11px;color:#8B6F4E;">
          Updated by ${escapeHtml(args.operatorEmail ?? "TabCall")}.
        </p>
      </td></tr>
    </table>
  `.trim();
  const text = `${args.org.name} — plan updated → ${planLabel} (${args.status.toLowerCase()})\n\n${perks}\n\nUpdated by ${args.operatorEmail ?? "TabCall"}.`;

  try {
    await sendEmail({ to: recipients, subject, html, text });
  } catch (err) {
    console.warn("[plan-flip] sendEmail failed", err);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
