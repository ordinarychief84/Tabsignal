import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { type PlanId, planFromOrg, meetsAtLeast, planById } from "@/lib/plans";
import { can, type Permission } from "@/lib/auth/permissions";

export type PlanGateFail = {
  ok: false;
  status: number;
  body: { error: string; detail?: string; required?: PlanId; current?: PlanId; requiredPerm?: Permission };
};

export type AdminGateOk = { ok: true; venueId: string; plan: PlanId; role: string };

// Look up venue + org and decide if the staff caller may use a feature on
// the given plan. Combines the venue/staff auth check with plan tier so
// every gated admin route stays one call.
export async function gateAdminVenuePlan(
  slug: string,
  staffVenueId: string,
  staffRole: string,
  required: PlanId,
): Promise<AdminGateOk | PlanGateFail> {
  const venue = await db.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) return { ok: false, status: 404, body: { error: "NOT_FOUND" } };
  if (venue.id !== staffVenueId) {
    return { ok: false, status: 403, body: { error: "FORBIDDEN" } };
  }
  const plan = planFromOrg(venue.org);
  if (!meetsAtLeast(plan, required)) {
    return {
      ok: false,
      status: 402,
      body: {
        error: "PLAN_REQUIRED",
        detail: `Requires ${planById(required)?.name ?? required} plan.`,
        required,
        current: plan,
      },
    };
  }
  return { ok: true, venueId: venue.id, plan, role: staffRole };
}

// Guest-facing variant. Returns 404 instead of 402 so we don't reveal
// which features a venue has (or hasn't) paid for.
export async function gateGuestVenuePlan(
  slug: string,
  required: PlanId,
): Promise<{ ok: true; venueId: string; plan: PlanId } | PlanGateFail> {
  const venue = await db.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
    },
  });
  if (!venue) return { ok: false, status: 404, body: { error: "NOT_FOUND" } };
  const plan = planFromOrg(venue.org);
  if (!meetsAtLeast(plan, required)) {
    return { ok: false, status: 404, body: { error: "NOT_FOUND" } };
  }
  return { ok: true, venueId: venue.id, plan };
}

// Convenience wrapper: validates staff session + slug ownership + plan tier
// + (optional) role permission. Use from admin API routes — replaces the
// ad-hoc gateVenue helper each route used to define inline.
//
// Pass `requiredPerm` for any state-changing route (POST/PATCH/DELETE) so
// the role check rides alongside the venue + plan gate. Read routes can
// omit it; in-app pages decide whether the caller's role should *see* the
// data via the permission matrix on their side.
export async function gateAdminRoute(
  slug: string,
  required: PlanId,
  requiredPerm?: Permission,
): Promise<AdminGateOk | PlanGateFail> {
  const session = await getStaffSession();
  if (!session) return { ok: false, status: 401, body: { error: "UNAUTHORIZED" } };
  // Normalise legacy 'STAFF' rows: pre-RBAC venue creators carry role='STAFF'
  // in their session JWT. They're the venue owner by construction (only
  // /api/signup minted these) so treat them as OWNER for permission checks
  // until they sign back in and get an OWNER-stamped JWT.
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  const gate = await gateAdminVenuePlan(slug, session.venueId, effectiveRole, required);
  if (!gate.ok) return gate;
  if (requiredPerm && !can(effectiveRole, requiredPerm)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "FORBIDDEN",
        detail: `Your role can't ${requiredPerm}.`,
        requiredPerm,
      },
    };
  }
  return gate;
}

// Get the effective plan for a venue without doing the auth/forbidden dance.
// Used by server pages that have already verified the staff session.
export async function venuePlanForVenueId(venueId: string): Promise<PlanId> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { org: { select: { subscriptionPriceId: true, subscriptionStatus: true } } },
  });
  if (!venue) return "free";
  return planFromOrg(venue.org);
}
