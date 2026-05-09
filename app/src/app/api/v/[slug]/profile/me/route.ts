import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { verifyProfileToken, PROFILE_COOKIE } from "@/lib/profile-cookie";
import { pointsFor } from "@/lib/loyalty";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const token = cookies().get(PROFILE_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "NOT_IDENTIFIED" }, { status: 401 });
  const claims = await verifyProfileToken(token);
  if (!claims) return NextResponse.json({ error: "NOT_IDENTIFIED" }, { status: 401 });

  const profile = await db.guestProfile.findUnique({
    where: { id: claims.profileId },
    select: { id: true, phone: true, displayName: true, preferences: true, email: true },
  });
  if (!profile) return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });

  const points = await pointsFor(db, profile.id, gate.venueId);

  return NextResponse.json({
    id: profile.id,
    phone: profile.phone,
    displayName: profile.displayName,
    email: profile.email,
    preferences: profile.preferences,
    points,
  });
}
