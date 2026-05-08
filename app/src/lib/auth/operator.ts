import type { SessionClaims } from "./token";
import { db } from "../db";

const RAW = process.env.OPERATOR_EMAILS ?? "";
const ALLOWLIST = RAW
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Synchronous env-allowlist check. Kept for tight render paths that
// already call `isOperator(session)`. Prefer `isOperatorAsync` (which
// also checks `OrgMember` rows) for new code paths.
export function isOperator(session: SessionClaims | null | undefined): boolean {
  if (!session) return false;
  return ALLOWLIST.includes(session.email.toLowerCase());
}

// Tier 3a: an operator is anyone on the platform OPERATOR_EMAILS list
// (TabCall staff) OR any user with an OrgMember row anywhere (org
// owners, admins, viewers). Org-scoped permission checks live in
// lib/operator-rbac.ts.
export async function isOperatorAsync(
  session: SessionClaims | null | undefined,
): Promise<boolean> {
  if (!session) return false;
  if (ALLOWLIST.includes(session.email.toLowerCase())) return true;
  const member = await db.orgMember.findFirst({
    where: { email: session.email.toLowerCase() },
    select: { id: true },
  });
  return Boolean(member);
}

export function isPlatformStaff(session: SessionClaims | null | undefined): boolean {
  if (!session) return false;
  return ALLOWLIST.includes(session.email.toLowerCase());
}

export function operatorAllowlist(): readonly string[] {
  return ALLOWLIST;
}
