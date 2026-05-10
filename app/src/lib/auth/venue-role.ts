/**
 * Per-venue role gate.
 *
 * The StaffMember model only has one role today (STAFF) — when we need to
 * gate something like "only the manager can onboard Stripe Connect" or
 * "only the manager can add staff", we lean on the org-level OrgMember row
 * the signup flow auto-creates with role=OWNER. Anyone who joined the
 * venue as plain staff has no OrgMember row, so this returns false.
 *
 * Platform staff (TabCall internal) is treated as a manager everywhere so
 * support can poke around without role escalation.
 */

import { db } from "@/lib/db";
import { isPlatformStaff } from "./operator";
import type { SessionClaims } from "./token";

const MANAGER_ORG_ROLES = new Set(["OWNER", "ADMIN", "PLATFORM"] as const);

/**
 * Returns true when `session` belongs to a manager-tier user for the venue:
 *   - Platform staff (OPERATOR_EMAILS or PLATFORM org-member) → always
 *   - OrgMember with role OWNER or ADMIN of the venue's organization
 *
 * Pass the venue id so we look up the org once and never trust the caller.
 */
export async function isVenueManager(
  session: SessionClaims | null | undefined,
  venueId: string,
): Promise<boolean> {
  if (!session) return false;
  if (isPlatformStaff(session)) return true;
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { orgId: true },
  });
  if (!venue) return false;
  const member = await db.orgMember.findUnique({
    where: { orgId_email: { orgId: venue.orgId, email: session.email.toLowerCase() } },
    select: { role: true },
  });
  if (!member) return false;
  return MANAGER_ORG_ROLES.has(member.role as "OWNER" | "ADMIN" | "PLATFORM");
}
