import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { previewFor } from "@/lib/regulars";
import { events } from "@/lib/realtime";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";

const Body = z.object({
  sessionToken: z.string().min(1),
});

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Tier 3e: pair the active guest session to the cookie-identified
 * GuestProfile. Triggers the "regular arrived" buzz to staff if the
 * profile has prior visits at this venue.
 *
 * Idempotent — re-pairing the same profile is a no-op (no extra emit).
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    include: {
      venue: {
        select: {
          id: true,
          org: { select: { subscriptionPriceId: true, subscriptionStatus: true } },
        },
      },
      table: { select: { id: true, assignments: { select: { staffMemberId: true } } } },
    },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  // Pro feature — but never expose to non-Pro guests.
  if (!meetsAtLeast(planFromOrg(session.venue.org), "pro")) {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }

  const token = cookies().get(PROFILE_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "NOT_IDENTIFIED" }, { status: 401 });
  const claims = await verifyProfileToken(token);
  if (!claims) return NextResponse.json({ error: "NOT_IDENTIFIED" }, { status: 401 });

  // Idempotency: skip the buzz if we already paired this profile.
  const alreadyPaired = session.guestProfileId === claims.profileId;

  if (!alreadyPaired) {
    await db.guestSession.update({
      where: { id: session.id },
      data: { guestProfileId: claims.profileId },
    });
  }

  // Build the preview before emitting so we don't emit a payload-less event.
  const preview = await previewFor(claims.profileId, session.venueId);

  // Only buzz if this is a returning guest (visits > 0). First-timers
  // don't trigger the surprise — there's nothing to remember yet.
  if (!alreadyPaired && preview && preview.visits > 0) {
    const assignedStaffIds = session.table.assignments.map(a => a.staffMemberId);
    void events.regularArrived(
      session.venueId,
      session.id,
      session.table.id,
      preview,
      assignedStaffIds,
    );
  }

  return NextResponse.json({
    paired: !alreadyPaired,
    isReturning: (preview?.visits ?? 0) > 0,
    preview: preview ?? null,
  });
}
