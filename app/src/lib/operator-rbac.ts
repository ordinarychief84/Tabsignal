/**
 * Tier 3a: org-scoped RBAC for the operator console.
 *
 * Two ways to be an "operator" of an org:
 *   1. Platform staff: email is in OPERATOR_EMAILS env (sees every org)
 *   2. Org member: an OrgMember row links the email to the org with a role
 */

import { db } from "@/lib/db";
import type { SessionClaims } from "./auth/token";
import { isPlatformStaff } from "./auth/operator";

export type OrgRole = "OWNER" | "ADMIN" | "VIEWER" | "PLATFORM";

export type OrgAccess = {
  ok: true;
  role: OrgRole;
  orgId: string;
};

// All orgs the caller can see. Platform staff sees every org; non-staff
// sees only orgs they have a membership row for.
export async function listAccessibleOrgs(session: SessionClaims) {
  const email = session.email.toLowerCase();
  if (isPlatformStaff(session)) {
    return db.organization.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, plan: true, createdAt: true },
    });
  }
  const memberships = await db.orgMember.findMany({
    where: { email },
    include: {
      org: { select: { id: true, name: true, plan: true, createdAt: true } },
    },
  });
  return memberships
    .map(m => m.org)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function checkOrgAccess(
  session: SessionClaims | null | undefined,
  orgId: string,
): Promise<OrgAccess | { ok: false; status: number; reason: string }> {
  if (!session) return { ok: false, status: 401, reason: "UNAUTHORIZED" };
  if (isPlatformStaff(session)) {
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
