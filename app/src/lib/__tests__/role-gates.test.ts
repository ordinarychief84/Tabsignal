/**
 * Parametric role-gate matrix tests.
 *
 * For each admin mutation surface, assert which roles can and cannot
 * pass the can(role, perm) check. This locks down the role-vs-route
 * fix from the MVP audit so a future refactor can't quietly weaken
 * the permission set on a sensitive endpoint.
 *
 * The matrix below is the contract — each entry says "this route's
 * write operations require this permission". Routes that don't appear
 * in this matrix should be either read-only or already trivially gated
 * (e.g. /api/operator/* which checks isPlatformStaff).
 */

import { describe, expect, test } from "bun:test";
import { can } from "../auth/permissions";
import type { StaffRole } from "@prisma/client";

type EveryRole = StaffRole | "PLATFORM";

const ALL_ROLES: EveryRole[] = ["OWNER", "MANAGER", "SERVER", "HOST", "VIEWER", "STAFF", "PLATFORM"];

// Route → required permission for state-changing operations.
// Sourced from the actual gateAdminRoute(slug, plan, requiredPerm) calls
// after the role-gate fix landed. Keep this synced with the route files.
const ROUTE_PERM = {
  "PATCH /api/admin/v/[slug]":                          "venue.edit_settings",
  "POST  /api/admin/v/[slug]/logo":                     "venue.upload_logo",
  "POST  /api/admin/v/[slug]/tables":                   "tables.edit",
  "PATCH /api/admin/v/[slug]/tables/[id]":              "tables.edit",
  "DELETE /api/admin/v/[slug]/tables/[id]":             "tables.edit",
  "POST  /api/admin/v/[slug]/menu/items":               "menu.edit",
  "PATCH /api/admin/v/[slug]/menu/items/[id]":          "menu.edit",
  "DELETE /api/admin/v/[slug]/menu/items/[id]":         "menu.edit",
  "POST  /api/admin/v/[slug]/menu/categories":          "menu.edit",
  "PATCH /api/admin/v/[slug]/menu/categories/[id]":     "menu.edit",
  "DELETE /api/admin/v/[slug]/menu/categories/[id]":    "menu.edit",
  "POST  /api/admin/v/[slug]/specials":                 "specials.edit",
  "PATCH /api/admin/v/[slug]/specials/[id]":            "specials.edit",
  "DELETE /api/admin/v/[slug]/specials/[id]":           "specials.edit",
  "POST  /api/admin/v/[slug]/tip-pools":                "tip_pools.manage",
  "PATCH /api/admin/v/[slug]/tip-pools/[id]":           "tip_pools.manage",
  "POST  /api/admin/v/[slug]/regulars/import":          "regulars.edit",
  "POST  /api/admin/v/[slug]/regulars/[profileId]/notes": "regulars.edit",
  "PATCH /api/admin/v/[slug]/regulars/notes/[noteId]":  "regulars.edit",
  "DELETE /api/admin/v/[slug]/regulars/notes/[noteId]": "regulars.edit",
  "POST  /api/admin/v/[slug]/stripe/connect":           "stripe.connect_onboarding",
  "POST  /api/admin/v/[slug]/billing/portal":           "billing.change_plan",
  "POST  /api/admin/v/[slug]/billing/checkout":         "billing.change_plan",
  "POST  /api/admin/v/[slug]/billing/upgrade-contact":  "billing.view",
  "PUT   /api/admin/staff/[id]/tables":                 "staff.assign_tables",
} as const;

// Roles expected to PASS each permission (everything else is expected to FAIL).
// Mirrors lib/auth/permissions.ts MATRIX, kept duplicated on purpose so a
// silent weakening of MATRIX trips this test.
const PERM_ALLOWS: Record<string, EveryRole[]> = {
  "venue.edit_settings":       ["OWNER", "MANAGER", "PLATFORM"],
  "venue.upload_logo":         ["OWNER", "MANAGER", "PLATFORM"],
  "tables.edit":               ["OWNER", "MANAGER", "PLATFORM"],
  "menu.edit":                 ["OWNER", "MANAGER", "PLATFORM"],
  "specials.edit":             ["OWNER", "MANAGER", "PLATFORM"],
  "tip_pools.manage":          ["OWNER", "MANAGER", "PLATFORM"],
  "regulars.edit":             ["OWNER", "MANAGER", "PLATFORM"],
  // MANAGER can start Stripe Connect onboarding (per permissions.ts MATRIX).
  // The route ALSO requires isVenueManager which is OWNER|MANAGER|PLATFORM,
  // so this allow-list matches the deployed behaviour.
  "stripe.connect_onboarding": ["OWNER", "MANAGER", "PLATFORM"],
  // billing.change_plan is intentionally tighter — only Owner / PLATFORM
  // can commit the org to a Stripe Customer-Portal-level change.
  "billing.change_plan":       ["OWNER", "PLATFORM"],
  "billing.view":              ["OWNER", "MANAGER", "VIEWER", "PLATFORM"],
  "staff.assign_tables":       ["OWNER", "MANAGER", "PLATFORM"],
};

describe("Admin route role gates", () => {
  for (const [route, perm] of Object.entries(ROUTE_PERM)) {
    const allowed = new Set(PERM_ALLOWS[perm] ?? []);
    for (const role of ALL_ROLES) {
      const should = allowed.has(role);
      test(`${route} (${perm}): ${role} ${should ? "ALLOWED" : "DENIED"}`, () => {
        expect(can(role, perm as Parameters<typeof can>[1])).toBe(should);
      });
    }
  }
});

// Spot-check the "legacy STAFF row gets promoted via normalisation"
// behaviour the production routes implement (effectiveRole = role === "STAFF"
// ? "OWNER" : role). The normalisation lives in each route + plan-gate.ts
// — these tests assert the can() matrix itself doesn't quietly grant STAFF
// permissions that bypass the normalisation.
describe("Legacy STAFF role: routes must normalise before can()", () => {
  for (const perm of [
    "venue.edit_settings",
    "staff.invite",
    "billing.change_plan",
    "stripe.connect_onboarding",
  ] as const) {
    test(`STAFF lacks ${perm} (routes must normalise to OWNER)`, () => {
      expect(can("STAFF", perm)).toBe(false);
    });
  }
});
