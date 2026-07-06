import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/v/[slug]/onboarding/complete
 *
 * Explicit "Go live" from the onboarding launchpad. Stamps
 * Venue.onboardingCompletedAt once; idempotent re-posts return the
 * original timestamp so a double-tap or a stale tab can't produce a
 * confusing error at the most celebratory moment of the flow.
 */
export async function POST(_req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, onboardingCompletedAt: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "venue.edit_settings")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't launch the venue." },
      { status: 403 },
    );
  }

  if (venue.onboardingCompletedAt) {
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      completedAt: venue.onboardingCompletedAt.toISOString(),
    });
  }

  const completedAt = new Date();
  await db.venue.update({
    where: { id: venue.id },
    data: { onboardingCompletedAt: completedAt },
  });

  void audit({
    venueId: venue.id,
    actor: session,
    action: "venue.launched",
    targetType: "Venue",
    targetId: venue.id,
    metadata: {},
  });

  return NextResponse.json({ ok: true, alreadyComplete: false, completedAt: completedAt.toISOString() });
}
