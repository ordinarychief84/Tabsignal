/**
 * Tier 3a: org-scoped RBAC for the operator console.
 *
 * Two ways to be an "operator" of an org:
 *   1. Platform staff: TabCall's own people — an active PlatformAdmin row,
 *      or an email in OPERATOR_EMAILS (sees every org)
 *   2. Org member: an OrgMember row links the email to the org with a role
 *
 * Both checks below use `isPlatformStaffAsync`, not the sync env-only
 * variant. OPERATOR_EMAILS is unset in production, so the sync check
 * matched nobody: a super admin could sign in at /admin/login, land in
 * /operator — and find an empty org list and a 403 on every plan change,
 * because platform staff was defined solely by an env var no deploy set.
 * The async variant reads PlatformAdmin, which is where super admins
 * actually live and where the /operator/admins UI adds them, so granting
 * an admin console powers no longer needs an env redeploy.
 */

import { db } from "@/lib/db";
import type { SessionClaims } from "./auth/token";
import { isPlatformStaffAsync } from "./auth/operator";
import { planFromOrg } from "./plans";

export type OrgRole = "OWNER" | "ADMIN" | "VIEWER" | "PLATFORM";

export type OrgAccess = {
  ok: true;
  role: OrgRole;
  orgId: string;
};

// All orgs the caller can see. Platform staff sees every org; non-staff
// sees only orgs they have a membership row for. `plan` is DERIVED from
// the Stripe subscription (restructure P3.4 retired Organization.plan).
const ORG_SUMMARY_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  subscriptionPriceId: true,
  subscriptionStatus: true,
} as const;

type OrgSummaryRow = {
  id: string;
  name: string;
  createdAt: Date;
  subscriptionPriceId: string | null;
  subscriptionStatus: string;
};

function toOrgSummary(org: OrgSummaryRow) {
  return { id: org.id, name: org.name, createdAt: org.createdAt, plan: planFromOrg(org) };
}

export async function listAccessibleOrgs(session: SessionClaims) {
  const email = session.email.toLowerCase();
  if (await isPlatformStaffAsync(session)) {
    const orgs = await db.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: ORG_SUMMARY_SELECT,
    });
    return orgs.map(toOrgSummary);
  }
  const memberships = await db.orgMember.findMany({
    where: { email },
    include: {
      org: { select: ORG_SUMMARY_SELECT },
    },
  });
  return memberships
    .map(m => toOrgSummary(m.org))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function checkOrgAccess(
  session: SessionClaims | null | undefined,
  orgId: string,
): Promise<OrgAccess | { ok: false; status: number; reason: string }> {
  if (!session) return { ok: false, status: 401, reason: "UNAUTHORIZED" };
  if (await isPlatformStaffAsync(session)) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (!org) return { ok: false, status: 404, reason: "ORG_NOT_FOUND" };
    return { ok: true, role: "PLATFORM", orgId };
  }
  const member = await db.orgMember.findUnique({
    where: { orgId_email: { orgId, email: session.email.toLowerCase() } },
    select: { role: true, orgId: true },
  });
  if (!member) return { ok: false, status: 403, reason: "FORBIDDEN" };
  return { ok: true, role: member.role, orgId: member.orgId };
}

export function canBroadcast(role: OrgRole): boolean {
  return role === "PLATFORM" || role === "OWNER" || role === "ADMIN";
}
