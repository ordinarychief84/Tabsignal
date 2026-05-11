/**
 * POST /api/admin/staff/[id]/resend-invite
 *
 * Mints a fresh magic-link for an INVITED (or otherwise stuck) staff
 * row and re-sends the welcome email. Useful when:
 *   - The original invite expired (15-minute TTL)
 *   - The invitee swears they never received it (spam folder, typo
 *     they want re-sent, etc.)
 *
 * Manager-tier action; emits an audit row.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";
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

  const token = await signLinkToken({ kind: "link", staffId: target.id, email: target.email });
  const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;

  let devLink: string | null = null;
  let delivered = true;
  try {
    await sendMagicLinkEmail({
      to: target.email,
      staffName: target.name,
      venueName: target.venue.name,
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
    const allowDevLinks = process.env.TABSIGNAL_DEV_LINKS === "true" || process.env.NODE_ENV === "development";
    if (allowDevLinks) devLink = link;
  }

  void audit({
    venueId: target.venueId,
    actor: session,
    action: "staff.invite_resent",
    targetType: "StaffMember",
    targetId: target.id,
    metadata: { email: target.email, delivered },
  });

  return NextResponse.json({ ok: true, delivered, devLink });
}
