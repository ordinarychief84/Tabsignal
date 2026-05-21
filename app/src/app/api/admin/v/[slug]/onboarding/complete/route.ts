import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

/**
 * Stamp `Venue.onboardingCompletedAt = now()` when the user clicks the
 * explicit "Launch venue" CTA on the final wizard step.
 *
 * A separate endpoint (not just another PATCH /api/admin/v/[slug] call)
 * because it is the trigger that flips the dashboard out of "resume
 * setup" mode — keeping it isolated makes the intent legible in audit
 * logs and avoids the risk of an accidental field-name typo in the
 * generic PATCH body silently un-completing onboarding.
 *
 * Idempotent: re-POSTing returns the existing timestamp without
 * overwriting. The wizard depends on this — a slow network might
 * double-fire the launch click.
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
  // Legacy STAFF (pre-RBAC venue creators) get promoted to OWNER for
  // the permission check — same pattern as the venue PATCH route.
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "venue.edit_settings")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't finish onboarding." },
      { status: 403 },
    );
  }

  if (venue.onboardingCompletedAt) {
    return NextResponse.json({
      ok: true,
      alreadyCompleted: true,
      onboardingCompletedAt: venue.onboardingCompletedAt.toISOString(),
    });
  }

  const updated = await db.venue.update({
    where: { id: venue.id },
    data: { onboardingCompletedAt: new Date() },
    select: { onboardingCompletedAt: true },
  });

  return NextResponse.json({
    ok: true,
    alreadyCompleted: false,
    onboardingCompletedAt: updated.onboardingCompletedAt?.toISOString() ?? null,
  });
}
