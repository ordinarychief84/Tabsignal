/**
 * POST /api/admin/staff/[id]/resend-invite
 *
 * Mints a fresh 7-day invite link for an INVITED (or otherwise stuck)
 * staff row and re-sends the invite email. Useful when:
 *   - The original invite expired
 *   - The invitee swears they never received it (spam folder, typo
 *     they want re-sent, etc.)
 *
 * Manager-tier action; emits an audit row. The fresh link is returned
 * to the caller so it can be copied and handed over out-of-band.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { signInviteToken } from "@/lib/auth/token";
import { sendStaffInviteEmail } from "@/lib/auth/email";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { appOrigin } from "@/lib/origin";

type Ctx = { params: { id: string } };

export async function POST(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!can(session.role, "staff.invite")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const target = await db.staffMember.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, email: true, name: true, venueId: true, status: true, venue: { select: { name: true } } },
  });
  if (!target || target.venueId !== session.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (target.status === "SUSPENDED") {
    return NextResponse.json(
      { error: "SUSPENDED", detail: "Reactivate the user before re-sending an invite." },
      { status: 409 },
    );
  }

  const token = await signInviteToken({ kind: "link", staffId: target.id, email: target.email });
  const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;

  let delivered = true;
  try {
    await sendStaffInviteEmail({
      to: target.email,
      staffName: target.name,
      venueName: target.venue.name,
      role: null,
      link,
    });
  } catch (err) {
    delivered = false;
    const e = err as { statusCode?: number; message?: string };
    console.error("[admin/staff/resend] email send failed", {
      email: target.email,
      statusCode: e.statusCode,
      message: e.message,
    });
  }

  void audit({
    venueId: target.venueId,
    actor: session,
    action: "staff.invite_resent",
    targetType: "StaffMember",
    targetId: target.id,
    metadata: { email: target.email, delivered },
  });

  // inviteLink returned for the copy-to-clipboard fallback in the People
  // panel; devLink kept for older clients that only read it on failure.
  return NextResponse.json({ ok: true, delivered, inviteLink: link, devLink: delivered ? null : link });
}
