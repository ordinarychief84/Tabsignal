/**
 * Phase-1 RBAC matrix for the venue admin.
 *
 * Roles map to the StaffRole enum in prisma/schema.prisma. Permissions
 * are dot-namespaced action strings ("staff.invite", "menu.edit", …).
 *
 * Why a centralized matrix vs. role checks scattered across routes:
 *   - One place to audit "what can a Manager actually do?"
 *   - The People page UI reuses `can()` to grey out buttons the caller
 *     can't trigger anyway, keeping client + server in sync.
 *   - Adding HOST or BARTENDER later is a one-row edit.
 *
 * Conventions
 *   - PLATFORM (TabCall internal) is a synthetic role we tag onto
 *     `isPlatformStaff()` callers via `permissionsForSession()` —
 *     they always pass every check.
 *   - STAFF is a legacy enum value still present on rows that
 *     pre-date the RBAC migration. Treat it as SERVER for read-side
 *     and as nothing for write-side until the migration backfills it
 *     to OWNER.
 */

import type { StaffRole } from "@prisma/client";

/** All possible permission verbs in the system. Add new ones here. */
export type Permission =
  // Staff lifecycle
  | "staff.invite"
  | "staff.role.assign_manager"
  | "staff.role.assign_below_manager"
  | "staff.suspend"
  | "staff.reactivate"
  | "staff.remove"
  | "staff.assign_tables"
  | "staff.list"
  // Venue settings
  | "venue.edit_settings"
  | "venue.kill_switch"
  | "venue.upload_logo"
  // Stripe / money
  | "stripe.connect_onboarding"
  | "billing.view"
  | "billing.change_plan"
  // Menu + ops
  | "menu.edit"
  | "menu.feature_toggle"
  | "tables.edit"
  | "specials.edit"
  | "promotions.manage"
  | "tip_pools.manage"
  | "preorders.manage"
  | "reservations.manage"
  | "reviews.view"
  | "reviews.respond"
  | "regulars.view"
  | "regulars.edit"
  | "audit.view"
  // Branding
  | "branding.manage"
  // Integrations
  | "pos.manage"
  // Guest Commerce Module (Orders + Bills V2)
  | "orders.manage"
  | "bills.view"
  // Floor (handled mostly by /staff app, listed for completeness)
  | "requests.acknowledge"
  | "requests.handoff"
  | "requests.resolve";

/**
 * Effective role used for permission checks. Includes the synthetic
 * PLATFORM tier we layer on top of the DB role for TabCall internal
 * staff (matching `isPlatformStaff()`).
 */
export type EffectiveRole = StaffRole | "PLATFORM";

const ALL_PERMS = new Set<Permission>([
  "staff.invite",
  "staff.role.assign_manager",
  "staff.role.assign_below_manager",
  "staff.suspend",
  "staff.reactivate",
  "staff.remove",
  "staff.assign_tables",
  "staff.list",
  "venue.edit_settings",
  "venue.kill_switch",
  "venue.upload_logo",
  "stripe.connect_onboarding",
  "billing.view",
  "billing.change_plan",
  "menu.edit",
  "menu.feature_toggle",
  "tables.edit",
  "specials.edit",
  "promotions.manage",
  "tip_pools.manage",
  "preorders.manage",
  "reservations.manage",
  "reviews.view",
  "reviews.respond",
  "regulars.view",
  "regulars.edit",
  "audit.view",
  "branding.manage",
  "pos.manage",
  "orders.manage",
  "bills.view",
  "requests.acknowledge",
  "requests.handoff",
  "requests.resolve",
]);

const MATRIX: Record<EffectiveRole, Set<Permission>> = {
  // Platform (TabCall internal) inherits OWNER. Treated identically by
  // the matrix — any extra platform-only powers (impersonation, plan
  // flip) live behind isPlatformStaff() checks, not here.
  PLATFORM: ALL_PERMS,

  OWNER: ALL_PERMS,

  MANAGER: new Set<Permission>([
    "staff.invite",
    // Manager can assign Server / Host / Viewer but NOT promote to
    // Manager (only Owner can mint another Manager). Prevents a
    // Manager from cascading their own privileges.
    "staff.role.assign_below_manager",
    "staff.suspend",
    "staff.reactivate",
    "staff.assign_tables",
    "staff.list",
    "venue.edit_settings",
    "venue.kill_switch",
    "venue.upload_logo",
    "stripe.connect_onboarding",
    "billing.view",
    "menu.edit",
    "menu.feature_toggle",
    "tables.edit",
    "specials.edit",
    "promotions.manage",
    "tip_pools.manage",
    "preorders.manage",
    "reservations.manage",
    "reviews.view",
    "reviews.respond",
    "regulars.view",
    "regulars.edit",
    "audit.view",
    "branding.manage",
    "pos.manage",
    "orders.manage",
    "bills.view",
    "requests.acknowledge",
    "requests.handoff",
    "requests.resolve",
  ]),

  // Servers + Bartenders (mapped to SERVER) live on the floor app.
  SERVER: new Set<Permission>([
    "preorders.manage",
    "reservations.manage", // can mark ARRIVED/SEATED, not create
    "regulars.view",
    "requests.acknowledge",
    "requests.handoff",
    "requests.resolve",
  ]),

  // Hosts focus on door + reservations.
  HOST: new Set<Permission>([
    "reservations.manage",
    "regulars.view",
    "requests.acknowledge",
  ]),

  // Read-only — operators / accountants who shouldn't touch anything.
  VIEWER: new Set<Permission>([
    "staff.list",
    "billing.view",
    "bills.view",
    "reviews.view",
    "regulars.view",
    "audit.view",
  ]),

  // Legacy single-value enum — match SERVER for read side; no writes
  // until the migration backfill flips these rows to OWNER.
  STAFF: new Set<Permission>([
    "staff.list",
    "preorders.manage",
    "reservations.manage",
    "regulars.view",
    "requests.acknowledge",
    "requests.handoff",
    "requests.resolve",
  ]),
};

/**
 * Does this role have this permission? Pass the role exactly as it sits
 * on `StaffMember.role` (or the synthetic "PLATFORM" tier).
 */
export function can(role: EffectiveRole | string | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  const set = MATRIX[role as EffectiveRole];
  return set ? set.has(perm) : false;
}

/** Convenience: throw if denied. Use in API routes. */
export function requirePermission(role: EffectiveRole | string | null | undefined, perm: Permission): void {
  if (!can(role, perm)) {
    const err = new Error(`FORBIDDEN: missing permission ${perm} for role ${role ?? "anonymous"}`);
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

/**
 * Manager-tier? Used as a quick gate on routes that don't need a
 * specific permission but require above-floor access.
 */
export function isManagerOrAbove(role: EffectiveRole | string | null | undefined): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "PLATFORM";
}

/** Friendly labels for UI rendering. */
export const ROLE_LABELS: Record<StaffRole | "PLATFORM", string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SERVER: "Server",
  HOST: "Host",
  VIEWER: "Viewer",
  STAFF: "Staff (legacy)",
  PLATFORM: "TabCall",
};

/**
 * Roles that should be visible in the role-picker dropdown when a
 * user with `actorRole` is inviting / promoting someone. Excludes
 * STAFF (legacy) and PLATFORM (synthetic). OWNER is in the list only
 * for OWNER actors — Managers can't mint additional Owners.
 */
export function assignableRoles(actorRole: EffectiveRole | string | null | undefined): StaffRole[] {
  const base: StaffRole[] = ["MANAGER", "SERVER", "HOST", "VIEWER"];
  if (actorRole === "OWNER" || actorRole === "PLATFORM") {
    return ["OWNER", ...base];
  }
  if (actorRole === "MANAGER") {
    // Managers can assign Server/Host/Viewer but not Manager or Owner.
    return ["SERVER", "HOST", "VIEWER"];
  }
  return [];
}
