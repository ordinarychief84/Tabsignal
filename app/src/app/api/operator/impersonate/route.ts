import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator, isPlatformStaff } from "@/lib/auth/operator";
import { signSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

const Body = z.object({
  // Either a venue slug or venue id is accepted.
  slug: z.string().optional(),
  venueId: z.string().optional(),
  // Free-text reason logged for the audit trail.
  reason: z.string().max(500).optional(),
}).refine(b => !!b.slug || !!b.venueId, { message: "slug_or_venueId_required" });

/**
 * Operator impersonation. Replaces the operator's current session with
 * one scoped to a target venue's staff record so they can poke around
 * the manager dashboard exactly as the venue would see it.
 *
 * Hard rule: ONLY platform staff (OPERATOR_EMAILS env). NOT regular
 * OrgMembers — they should never be able to log in as one of their
 * org's staff. Audit logged with the operator's email so impersonation
 * is traceable.
 *
 * To stop impersonating: sign out (POST /api/auth/logout) and sign back
 * in with the operator's own email. Future iteration: stash the
 * pre-impersonation session in a separate cookie for one-tap restore.
 */
export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!isPlatformStaff(session) || !isOperator(session)) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Impersonation requires OPERATOR_EMAILS membership." }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" }, { status: 400 });
  }

  const venue = await db.venue.findFirst({
    where: parsed.venueId ? { id: parsed.venueId } : { slug: parsed.slug! },
    select: { id: true, slug: true, name: true },
  });
  if (!venue) return NextResponse.json({ error: "VENUE_NOT_FOUND" }, { status: 404 });

  // Pick the oldest staff member as the persona — that's likely the
  // owner. If the venue has no staff yet, we cannot impersonate
  // (without a staff row, request acks etc. would attribute to no one).
  const targetStaff = await db.staffMember.findFirst({
    where: { venueId: venue.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!targetStaff) {
    return NextResponse.json(
      { error: "NO_STAFF", detail: "Venue has no staff to impersonate. Create one first." },
      { status: 409 }
    );
  }

  const token = await signSessionToken({
    kind: "session",
    staffId: targetStaff.id,
    venueId: venue.id,
    // Keep the operator's email on the claims so server-side audit logs
    // (request acks, comp actions, etc.) show who actually performed the
    // action rather than the impersonated staff member's email.
    email: session.email,
    role: targetStaff.role,
  });

  console.warn(
    `[operator:impersonate-start] operator=${session.email} → venueId=${venue.id} ` +
    `slug=${venue.slug} asStaffId=${targetStaff.id} (${targetStaff.email})` +
    (parsed.reason ? ` reason="${parsed.reason}"` : "")
  );

  const res = NextResponse.json({
    ok: true,
    venueSlug: venue.slug,
    venueName: venue.name,
    asStaff: { id: targetStaff.id, email: targetStaff.email, name: targetStaff.name },
    redirectTo: `/admin/v/${venue.slug}`,
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(1)); // short-lived: 1 day
  return res;
}
