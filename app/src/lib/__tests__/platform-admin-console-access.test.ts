/**
 * A super admin's route into the operator console, and the plan grant at
 * the end of it.
 *
 * Two independent breaks made "sign in at /admin/login and comp a venue
 * onto Growth" impossible, and each one is pinned here:
 *
 *  1. Org RBAC decided "platform staff" from OPERATOR_EMAILS alone. That
 *     env var is unset in production, so a signed-in PlatformAdmin saw an
 *     EMPTY org list and got 403 on every plan change — while the billing
 *     route's own gate (isPlatformStaffAsync, which reads the table) let
 *     them through. Two definitions of the same role, disagreeing.
 *
 *  2. /api/admin/login set the admin cookie but left any staff cookie in
 *     place. getStaffSession() reads the staff one FIRST, so the console
 *     kept resolving the old venue identity, decided it wasn't an
 *     operator, and redirected to /staff. The sign-in looked like it
 *     worked and landed nowhere near the console.
 *
 * Suspension is covered too: an operator whose PlatformAdmin row is
 * suspended must lose org access, since revoking a super admin is done by
 * suspending the row and nothing else.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SessionClaims } from "../auth/token";

/**
 * `@/lib/auth/operator` is stubbed WHOLE rather than letting the real one
 * run against a mocked db: it captures its `db` import at module load, and
 * bun's registry is process-wide, so whether a mock reaches it depends on
 * which suite loaded it first — the tests passed alone and failed in a
 * full run. Stubbing the boundary makes the assertion order-independent
 * and states the regression exactly: the sync, env-only check reports
 * FALSE for everyone here, mirroring production where OPERATOR_EMAILS is
 * unset. Anything that still works must have gone through the async,
 * table-backed check. The stub carries every export, since a partial one
 * would follow this file into the next suite.
 */

type State = {
  admins: { email: string; suspendedAt: Date | null }[];
  members: { orgId: string; email: string; role: "OWNER" | "ADMIN" | "VIEWER" }[];
  orgs: { id: string; name: string }[];
};

const state: State = { admins: [], members: [], orgs: [] };

const ORG = {
  id: "org_1",
  name: "Otto's Lounge Group",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  subscriptionPriceId: null,
  subscriptionStatus: "NONE",
};

function session(email: string): SessionClaims {
  return { kind: "session", staffId: "pa_1", venueId: "platform", email, role: "OWNER" };
}

beforeEach(() => {
  state.admins = [{ email: "founder@tab-call.com", suspendedAt: null }];
  state.members = [];
  state.orgs = [{ id: ORG.id, name: ORG.name }];

  mock.module("@/lib/auth/operator", () => ({
    // Production's posture: the env allowlist grants nobody.
    isOperator: () => false,
    isPlatformStaff: () => false,
    operatorAllowlist: () => [],
    isOperatorAsync: async (s: SessionClaims | null) =>
      !!s && state.admins.some(a => a.email === s.email && a.suspendedAt === null),
    isPlatformStaffAsync: async (s: SessionClaims | null) =>
      !!s && state.admins.some(a => a.email === s.email && a.suspendedAt === null),
  }));

  // Full export surface: bun's mock.module is process-wide, so a partial
  // mock of @/lib/db would follow this file into whichever suite runs next.
  mock.module("@/lib/db", () => ({
    db: {
      platformAdmin: {
        findUnique: async ({ where }: { where: { email?: string } }) => {
          const row = state.admins.find(a => a.email === where.email);
          return row ? { id: "pa_1", suspendedAt: row.suspendedAt } : null;
        },
      },
      orgMember: {
        findUnique: async ({ where }: { where: { orgId_email: { orgId: string; email: string } } }) => {
          const { orgId, email } = where.orgId_email;
          const m = state.members.find(x => x.orgId === orgId && x.email === email);
          return m ? { role: m.role, orgId: m.orgId } : null;
        },
        findMany: async ({ where }: { where: { email: string } }) =>
          state.members
            .filter(m => m.email === where.email)
            .map(m => ({ org: ORG })),
        findFirst: async ({ where }: { where: { email: string } }) =>
          state.members.find(m => m.email === where.email) ? { id: "om_1" } : null,
      },
      organization: {
        findMany: async () => state.orgs.map(o => ({ ...ORG, id: o.id, name: o.name })),
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.orgs.find(o => o.id === where.id) ? { id: where.id } : null,
      },
    },
  }));
});

afterEach(() => { mock.restore(); });

describe("operator org RBAC for a platform admin", () => {
  test("an active PlatformAdmin can reach an org they hold no membership in", async () => {
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(session("founder@tab-call.com"), ORG.id);
    expect(access.ok).toBe(true);
    // PLATFORM, not a member role — this is what the billing route needs
    // to let the grant through.
    expect(access.ok && access.role).toBe("PLATFORM");
  });

  test("…and sees every org, not an empty list", async () => {
    const { listAccessibleOrgs } = await import("../operator-rbac");
    const orgs = await listAccessibleOrgs(session("founder@tab-call.com"));
    expect(orgs.map(o => o.id)).toEqual([ORG.id]);
  });

  test("a suspended PlatformAdmin loses org access", async () => {
    state.admins = [{ email: "founder@tab-call.com", suspendedAt: new Date("2026-08-01") }];
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(session("founder@tab-call.com"), ORG.id);
    expect(access.ok).toBe(false);
    expect(access.ok === false && access.status).toBe(403);
  });

  test("a stranger with no admin row and no membership is refused", async () => {
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(session("someone@example.com"), ORG.id);
    expect(access.ok).toBe(false);
    expect(access.ok === false && access.status).toBe(403);
  });

  test("an org member still gets their own role, not PLATFORM", async () => {
    state.admins = [];
    state.members = [{ orgId: ORG.id, email: "gm@ottos.com", role: "ADMIN" }];
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(session("gm@ottos.com"), ORG.id);
    expect(access.ok && access.role).toBe("ADMIN");
  });

  test("an org member cannot reach a DIFFERENT org", async () => {
    state.admins = [];
    state.members = [{ orgId: "org_other", email: "gm@ottos.com", role: "OWNER" }];
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(session("gm@ottos.com"), ORG.id);
    expect(access.ok).toBe(false);
  });

  test("a missing org is 404, not a silent 403", async () => {
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(session("founder@tab-call.com"), "org_gone");
    expect(access.ok === false && access.status).toBe(404);
  });

  test("no session at all is 401", async () => {
    const { checkOrgAccess } = await import("../operator-rbac");
    const access = await checkOrgAccess(null, ORG.id);
    expect(access.ok === false && access.status).toBe(401);
  });
});
