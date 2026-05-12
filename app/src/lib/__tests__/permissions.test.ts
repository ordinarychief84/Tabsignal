/**
 * Phase-1 RBAC matrix tests. Locks down the rules that are easy to
 * regress: who can mint Managers, who can suspend, who can remove,
 * who can read the audit log. Run with `bun test`.
 */

import { describe, expect, test } from "bun:test";
import { can, isManagerOrAbove, assignableRoles, requirePermission } from "../auth/permissions";

describe("can()", () => {
  test("Owner has every permission", () => {
    for (const perm of [
      "staff.invite",
      "staff.role.assign_manager",
      "staff.role.assign_below_manager",
      "staff.suspend",
      "staff.remove",
      "billing.change_plan",
      "audit.view",
    ] as const) {
      expect(can("OWNER", perm)).toBe(true);
    }
  });

  test("Manager can invite + assign_below_manager but NOT assign_manager or remove", () => {
    expect(can("MANAGER", "staff.invite")).toBe(true);
    expect(can("MANAGER", "staff.role.assign_below_manager")).toBe(true);
    expect(can("MANAGER", "staff.suspend")).toBe(true);
    expect(can("MANAGER", "staff.role.assign_manager")).toBe(false);
    expect(can("MANAGER", "staff.remove")).toBe(false);
    expect(can("MANAGER", "billing.change_plan")).toBe(false);
  });

  test("Server / Host / Viewer can't touch staff lifecycle", () => {
    for (const role of ["SERVER", "HOST", "VIEWER"] as const) {
      expect(can(role, "staff.invite")).toBe(false);
      expect(can(role, "staff.role.assign_below_manager")).toBe(false);
      expect(can(role, "staff.role.assign_manager")).toBe(false);
      expect(can(role, "staff.suspend")).toBe(false);
      expect(can(role, "staff.remove")).toBe(false);
    }
  });

  test("Viewer can read audit log + billing but not act", () => {
    expect(can("VIEWER", "audit.view")).toBe(true);
    expect(can("VIEWER", "billing.view")).toBe(true);
    expect(can("VIEWER", "venue.edit_settings")).toBe(false);
  });

  test("Server / Host can ack requests; Viewer cannot", () => {
    expect(can("SERVER", "requests.acknowledge")).toBe(true);
    expect(can("HOST", "requests.acknowledge")).toBe(true);
    expect(can("VIEWER", "requests.acknowledge")).toBe(false);
  });

  test("Platform inherits Owner", () => {
    expect(can("PLATFORM", "staff.role.assign_manager")).toBe(true);
    expect(can("PLATFORM", "billing.change_plan")).toBe(true);
  });

  test("Legacy STAFF row gets read access only (until backfill)", () => {
    expect(can("STAFF", "staff.list")).toBe(true);
    expect(can("STAFF", "staff.invite")).toBe(false);
    expect(can("STAFF", "staff.remove")).toBe(false);
  });

  test("null / unknown role denied for everything", () => {
    expect(can(null, "staff.invite")).toBe(false);
    expect(can(undefined, "staff.invite")).toBe(false);
    expect(can("ROBOT_OVERLORD", "staff.invite")).toBe(false);
  });
});

describe("isManagerOrAbove()", () => {
  test("OWNER + MANAGER + PLATFORM yes; floor roles no", () => {
    expect(isManagerOrAbove("OWNER")).toBe(true);
    expect(isManagerOrAbove("MANAGER")).toBe(true);
    expect(isManagerOrAbove("PLATFORM")).toBe(true);
    expect(isManagerOrAbove("SERVER")).toBe(false);
    expect(isManagerOrAbove("HOST")).toBe(false);
    expect(isManagerOrAbove("VIEWER")).toBe(false);
    expect(isManagerOrAbove(null)).toBe(false);
  });
});

describe("assignableRoles()", () => {
  test("Owner picks from full set incl. OWNER", () => {
    const roles = assignableRoles("OWNER");
    expect(roles).toContain("OWNER");
    expect(roles).toContain("MANAGER");
    expect(roles).toContain("SERVER");
    expect(roles).not.toContain("PLATFORM");
    expect(roles).not.toContain("STAFF");
  });

  test("Manager picks below-manager only (no MANAGER, no OWNER)", () => {
    const roles = assignableRoles("MANAGER");
    expect(roles).not.toContain("OWNER");
    expect(roles).not.toContain("MANAGER");
    expect(roles).toEqual(["SERVER", "HOST", "VIEWER"]);
  });

  test("Floor roles get nothing", () => {
    expect(assignableRoles("SERVER")).toEqual([]);
    expect(assignableRoles("VIEWER")).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });
});

describe("requirePermission()", () => {
  test("throws 403-tagged error when denied", () => {
    let caught: unknown;
    try {
      requirePermission("SERVER", "staff.invite");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { status?: number }).status).toBe(403);
    expect((caught as Error).message).toContain("staff.invite");
  });

  test("does not throw when permitted", () => {
    expect(() => requirePermission("OWNER", "staff.invite")).not.toThrow();
  });
});

// Regression for the signup role bug: when /api/signup is patched to set
// role='OWNER', a fresh venue creator must be able to drive the entire
// onboarding flow. Legacy 'STAFF' rows would silently fail these checks.
describe("Owner can drive onboarding (signup regression)", () => {
  const onboardingPerms = [
    "staff.invite",
    "staff.role.assign_manager",
    "staff.role.assign_below_manager",
    "venue.edit_settings",
    "venue.upload_logo",
    "venue.kill_switch",
    "stripe.connect_onboarding",
    "billing.view",
    "billing.change_plan",
    "menu.edit",
    "tables.edit",
    "specials.edit",
    "tip_pools.manage",
  ] as const;

  for (const perm of onboardingPerms) {
    test(`OWNER has ${perm}`, () => {
      expect(can("OWNER", perm)).toBe(true);
    });
    test(`legacy STAFF lacks ${perm} (this is why the signup bug bit us)`, () => {
      expect(can("STAFF", perm)).toBe(false);
    });
  }
});
