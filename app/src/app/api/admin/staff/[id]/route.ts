/**
 * Per-staff CRUD for the People page.
 *
 *   GET    /api/admin/staff/[id]  → fetch one row
 *   PATCH  /api/admin/staff/[id]  → change name / role / status
 *   DELETE /api/admin/staff/[id]  → hard-remove
 *
 * Authorization is layered:
 *   1. Session must exist + venue must match (no cross-venue mgmt).
 *   2. `staff.list` to read.
 *   3. `staff.role.assign_*` to change role (with the same Owner-only
 *      gate on Manager-tier targets used in /api/admin/staff POST).
 *   4. `staff.suspend` / `staff.reactivate` to flip status.
 *   5. `staff.remove` to DELETE — Owner-only by matrix; protected
 *      paths block self-removal and the last-Owner-standing case so
 *      a venue can't be locked out of its own dashboard.
 *
 * Every state-mutating call emits an AuditLog row via `audit()`.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import type { StaffRole, StaffStatus } from "@prisma/client";

type Ctx = { params: { id: string } };

async function loadTarget(id: string) {
  return db.staffMember.findUnique({
    where: { id },
    include: {
      invitedBy: { select: { name: true, email: true } },
      ackedRequests: { select: { id: true } },
    },
  });
}

function shape(s: Awaited<ReturnType<typeof loadTarget>>) {
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    section: s.section,
    status: s.status,
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    invitedAt: s.createdAt.toISOString(),
    invitedBy: s.invitedBy ? { name: s.invitedBy.name, email: s.invitedBy.email } : null,
    ackedCount: s.ackedRequests.length,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!can(session.role, "staff.list")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const target = await loadTarget(ctx.params.id);
  if (!target || target.venueId !== session.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ item: shape(target) });
}

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["OWNER", "MANAGER", "SERVER", "HOST", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional(),
  // Free-text section (e.g. "Patio"). Pass null to clear.
  section: z.string().max(40).nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const target = await loadTarget(ctx.params.id);
  if (!target || target.venueId !== session.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Build the update payload incrementally so we only audit the fields
  // that actually change.
  const data: { name?: string; role?: StaffRole; status?: StaffStatus; suspendedAt?: Date | null; suspendedById?: string | null; section?: string | null } = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  if (parsed.name && parsed.name !== target.name) {
    data.name = parsed.name;
    changes.name = { from: target.name, to: parsed.name };
  }

  // Section: free-text metadata; no permission gate beyond the existing
  // venue-manager check already enforced upstream. Accept null to clear.
  if (parsed.section !== undefined && parsed.section !== target.section) {
    data.section = parsed.section;
    changes.section = { from: target.section, to: parsed.section };
  }

  if (parsed.role && parsed.role !== target.role) {
    const targetIsManagerTier = parsed.role === "OWNER" || parsed.role === "MANAGER";
    const requiredPerm = targetIsManagerTier
      ? "staff.role.assign_manager"
      : "staff.role.assign_below_manager";
    if (!can(session.role, requiredPerm)) {
      return NextResponse.json(
        { error: "FORBIDDEN", detail: `Your role can't assign ${parsed.role}.` },
        { status: 403 },
      );
    }
    // Owner-protection: only an Owner can demote an existing Owner —
    // and we can never leave the venue with zero Owners.
    if (target.role === "OWNER" && parsed.role !== "OWNER") {
      if (session.role !== "OWNER" && session.role !== "PLATFORM" && session.role !== "STAFF") {
        return NextResponse.json(
          { error: "FORBIDDEN", detail: "Only an Owner can demote another Owner." },
          { status: 403 },
        );
      }
      const otherOwners = await db.staffMember.count({
        where: { venueId: target.venueId, role: "OWNER", status: "ACTIVE", id: { not: target.id } },
      });
      if (otherOwners === 0) {
        return NextResponse.json(
          { error: "LAST_OWNER", detail: "This is the venue's only Owner. Promote someone first." },
          { status: 409 },
        );
      }
    }
    data.role = parsed.role as StaffRole;
    changes.role = { from: target.role, to: parsed.role };
  }

  if (parsed.status && parsed.status !== target.status) {
    if (parsed.status === "SUSPENDED") {
      if (!can(session.role, "staff.suspend")) {
        return NextResponse.json({ error: "FORBIDDEN", detail: "Your role can't suspend staff." }, { status: 403 });
      }
      // Same Owner-protection on suspends.
      if (target.role === "OWNER") {
        const otherOwners = await db.staffMember.count({
          where: { venueId: target.venueId, role: "OWNER", status: "ACTIVE", id: { not: target.id } },
        });
        if (otherOwners === 0) {
          return NextResponse.json(
            { error: "LAST_OWNER", detail: "This is the venue's only Owner. Promote someone first." },
            { status: 409 },
          );
        }
      }
      if (target.id === session.staffId) {
        return NextResponse.json(
          { error: "SELF_SUSPEND", detail: "You can't suspend yourself." },
          { status: 409 },
        );
      }
      data.status = "SUSPENDED";
      data.suspendedAt = new Date();
      data.suspendedById = session.staffId;
    } else if (parsed.status === "ACTIVE") {
      if (!can(session.role, "staff.reactivate")) {
        return NextResponse.json({ error: "FORBIDDEN", detail: "Your role can't reactivate staff." }, { status: 403 });
      }
      data.status = "ACTIVE";
      data.suspendedAt = null;
      data.suspendedById = null;
    } else {
      // Manual flip back to INVITED is unusual; keep it a no-op for v1.
      return NextResponse.json({ error: "UNSUPPORTED_STATUS_TRANSITION" }, { status: 400 });
    }
    changes.status = { from: target.status, to: parsed.status };
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ item: shape(target) });
  }

  const updated = await db.staffMember.update({ where: { id: target.id }, data, include: {
    invitedBy: { select: { name: true, email: true } },
    ackedRequests: { select: { id: true } },
  } });

  void audit({
    venueId: target.venueId,
    actor: session,
    action: changes.role ? "staff.role_changed"
      : changes.status?.to === "SUSPENDED" ? "staff.suspended"
      : changes.status?.to === "ACTIVE" ? "staff.reactivated"
      : "staff.updated",
    targetType: "StaffMember",
    targetId: target.id,
    metadata: { email: target.email, ...changes },
  });

  return NextResponse.json({ item: shape(updated) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!can(session.role, "staff.remove")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Only Owners can remove staff. Suspend instead?" },
      { status: 403 },
    );
  }

  const target = await loadTarget(ctx.params.id);
  if (!target || target.venueId !== session.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (target.id === session.staffId) {
    return NextResponse.json(
      { error: "SELF_REMOVE", detail: "You can't remove yourself. Hand off Ownership first." },
      { status: 409 },
    );
  }
  if (target.role === "OWNER") {
    const otherOwners = await db.staffMember.count({
      where: { venueId: target.venueId, role: "OWNER", status: "ACTIVE", id: { not: target.id } },
    });
    if (otherOwners === 0) {
      return NextResponse.json(
        { error: "LAST_OWNER", detail: "This is the venue's only Owner." },
        { status: 409 },
      );
    }
  }

  // Hard delete. CASCADE on TableAssignment + nullable inviter/suspender
  // FKs handle the cleanup. Audit fired BEFORE the row vanishes so the
  // audit copy of the email/role survives.
  await audit({
    venueId: target.venueId,
    actor: session,
    action: "staff.removed",
    targetType: "StaffMember",
    targetId: target.id,
    metadata: { email: target.email, role: target.role, name: target.name },
  });
  await db.staffMember.delete({ where: { id: target.id } });

  return NextResponse.json({ ok: true });
}
