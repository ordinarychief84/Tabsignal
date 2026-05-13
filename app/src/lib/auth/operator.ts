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
// (TabCall staff), any active PlatformAdmin (super admin who signed in
// via password at /admin/login), or any user with an OrgMember row
// anywhere (org owners, admins, viewers). Org-scoped permission checks
// live in lib/operator-rbac.ts.
export async function isOperatorAsync(
  session: SessionClaims | null | undefined,
): Promise<boolean> {
  if (!session) return false;
  const email = session.email.toLowerCase();
  if (ALLOWLIST.includes(email)) return true;
  const admin = await db.platformAdmin.findUnique({
    where: { email },
    select: { id: true, suspendedAt: true },
  });
  if (admin && admin.suspendedAt === null) return true;
  const member = await db.orgMember.findFirst({
    where: { email },
    select: { id: true },
  });
  return Boolean(member);
}

export function isPlatformStaff(session: SessionClaims | null | undefined): boolean {
  if (!session) return false;
  return ALLOWLIST.includes(session.email.toLowerCase());
}

/**
 * Async variant: checks the env allowlist AND the PlatformAdmin DB
 * table (active rows only). Use this in mutating API routes so an
 * admin added via the /operator/admins UI is recognised without an
 * env redeploy. Sync `isPlatformStaff()` stays env-only for tight
 * render paths where a DB hit per request would hurt.
 */
export async function isPlatformStaffAsync(
  session: SessionClaims | null | undefined,
): Promise<boolean> {
  if (!session) return false;
  if (ALLOWLIST.includes(session.email.toLowerCase())) return true;
  const row = await db.platformAdmin.findUnique({
    where: { email: session.email.toLowerCase() },
    select: { id: true, suspendedAt: true },
  });
  return Boolean(row && row.suspendedAt === null);
}

export function operatorAllowlist(): readonly string[] {
  return ALLOWLIST;
}
