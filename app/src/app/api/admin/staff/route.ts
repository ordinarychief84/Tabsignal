import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { signInviteToken } from "@/lib/auth/token";
import { sendStaffInviteEmail } from "@/lib/auth/email";
import { isVenueManager } from "@/lib/auth/venue-role";
import { can, assignableRoles } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { appOrigin } from "@/lib/origin";
import type { StaffRole } from "@prisma/client";

const InviteBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  // Phase-1 RBAC: caller picks a role on invite. Default Server so
  // the floor is the safe fallback if the picker is omitted by an
  // older client.
  role: z.enum(["OWNER", "MANAGER", "SERVER", "HOST", "VIEWER"]).default("SERVER"),
  // Free-text section assignment (e.g. "Patio", "Bar"). Optional;
  // metadata only — doesn't affect TableAssignment-based request routing.
  section: z.string().max(40).nullable().optional(),
  send: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  if (!(await isVenueManager(session, session.venueId))) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Only managers can add staff." },
      { status: 403 },
    );
  }
  if (!can(session.role, "staff.invite")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't invite staff." },
      { status: 403 },
    );
  }

  let parsed;
  try { parsed = InviteBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Permission split: assigning Manager requires staff.role.assign_manager
  // (Owner-tier only). Anything below requires assign_below_manager.
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

  const email = parsed.email.toLowerCase().trim();
  const venue = await db.venue.findUnique({
    where: { id: session.venueId },
    select: { id: true, name: true },
  });
  if (!venue) return NextResponse.json({ error: "VENUE_NOT_FOUND" }, { status: 404 });

  // The actor's StaffMember row — used to attribute invitedBy + suspendedBy
  // and to name the inviter in the invite email.
  const actorRow = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, name: true },
  });

  // Idempotent: if email already exists, refuse cross-venue and return
  // existing record otherwise (no role overwrite — caller would PATCH
  // /[id] for that).
  const existing = await db.staffMember.findUnique({ where: { email } });
  if (existing && existing.venueId !== venue.id) {
    return NextResponse.json({ error: "EMAIL_ALREADY_USED_AT_OTHER_VENUE" }, { status: 409 });
  }

  const staff = existing ?? await db.staffMember.create({
    data: {
      venueId: venue.id,
      email,
      name: parsed.name,
      role: parsed.role as StaffRole,
      status: "INVITED",
      invitedById: actorRow?.id ?? null,
      ...(parsed.section !== undefined ? { section: parsed.section } : {}),
    },
  });

  // Mint a 7-day single-use invite link. Always returned to the caller
  // (manager-tier by the gates above) so the manager can hand it to the
  // invitee directly — text/AirDrop — when the invitee has no work email
  // or delivery fails. This is not an escalation: the caller just created
  // (or already administers) this lower-or-equal-privilege account.
  const token = await signInviteToken({ kind: "link", staffId: staff.id, email });
  const inviteLink = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;

  let emailDelivered: boolean | null = null; // null = not attempted (send:false)
  if (parsed.send) {
    emailDelivered = true;
    try {
      await sendStaffInviteEmail({
        to: email,
        staffName: staff.name,
        venueName: venue.name,
        inviterName: actorRow?.name ?? null,
        role: staff.role,
        link: inviteLink,
      });
    } catch (err) {
      const e = err as { statusCode?: number; message?: string };
      console.error("[admin/staff] invite email send failed", {
        email,
        statusCode: e.statusCode,
        message: e.message,
      });
      emailDelivered = false;
    }
  }

  if (!existing) {
    void audit({
      venueId: venue.id,
      actor: session,
      action: "staff.invited",
      targetType: "StaffMember",
      targetId: staff.id,
      metadata: { email, role: parsed.role, name: parsed.name },
    });
  }

  return NextResponse.json({
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    section: staff.section,
    status: staff.status,
    lastSeenAt: staff.lastSeenAt?.toISOString() ?? null,
    invitedById: staff.invitedById,
    inviteLink,
    emailDelivered,
    // Legacy field older clients read when email delivery failed in dev.
    devLink: emailDelivered === false ? inviteLink : null,
  });
}

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!can(session.role, "staff.list")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const staff = await db.staffMember.findMany({
    // Hide soft-deleted rows. They remain in the DB for audit history
    // (acknowledgedBy on closed Requests) but they shouldn't appear in
    // any "current roster" surface.
    where: { venueId: session.venueId, status: { not: "DELETED" } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      ackedRequests: { select: { id: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({
    items: staff.map(s => ({
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
      createdAt: s.createdAt.toISOString(),
    })),
    // Echo what the *caller* may pick from in their role dropdowns so
    // the UI doesn't have to recompute.
    assignableRoles: assignableRoles(session.role),
    selfId: session.staffId,
  });
}
