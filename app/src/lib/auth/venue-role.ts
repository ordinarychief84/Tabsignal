/**
 * Per-venue role gate.
 *
 * Phase-1 RBAC: roles live on `StaffMember.role` (StaffRole enum).
 * Manager-tier callers are OWNER, MANAGER, or PLATFORM staff. We trust
 * the role baked into the session JWT to avoid an extra DB roundtrip
 * on every request — the JWT is re-issued on each magic-link sign-in,
 * so a role downgrade takes effect on the suspended user's next login
 * (which they can no longer achieve anyway). Role *upgrades* require
 * a fresh login; the People page UI tells managers this.
 *
 * Platform staff (TabCall internal via OPERATOR_EMAILS) is treated as
 * a manager everywhere so support can poke around without role
 * escalation.
 *
 * Legacy: rows with `role === "STAFF"` predate the RBAC migration and
 * are venue creators by construction. The migration backfill flips
 * them to OWNER, but this helper recognises STAFF as manager-tier
 * during the transition window so existing managers don't lose
 * access between deploy and migrate.
 */

import { isPlatformStaff } from "./operator";
import { isManagerOrAbove } from "./permissions";
import type { SessionClaims } from "./token";

export async function isVenueManager(
  session: SessionClaims | null | undefined,
  _venueId: string,
): Promise<boolean> {
  if (!session) return false;
  if (isPlatformStaff(session)) return true;
  // Session JWT carries the role baked at sign-in time. Normalise the
  // legacy STAFF value into manager-tier during the migration window.
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  return isManagerOrAbove(role);
}
