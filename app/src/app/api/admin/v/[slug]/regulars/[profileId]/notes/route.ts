import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { getStaffSession } from "@/lib/auth/session";

const Body = z.object({
  body: z.string().min(1).max(2000),
  pinned: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: { slug: string; profileId: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro", "regulars.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Already gated, but we need the staff identity for authorship.
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Confirm the profile actually has at least one paid session at this
  // venue — prevents staff at venue A from notating profiles that have
  // never visited (data fishing guard).
  const everPaid = await db.guestSession.findFirst({
    where: { guestProfileId: ctx.params.profileId, venueId: gate.venueId, paidAt: { not: null } },
    select: { id: true },
  });
  if (!everPaid) return NextResponse.json({ error: "NOT_A_REGULAR" }, { status: 404 });

  // Resolve the staff member's display name for denormalization.
  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { name: true },
  });

  const note = await db.guestNote.create({
    data: {
      guestProfileId: ctx.params.profileId,
      venueId: gate.venueId,
      authorStaffId: session.staffId,
      authorName: staff?.name ?? session.email,
      body: parsed.body,
      pinned: parsed.pinned ?? false,
    },
  });

  return NextResponse.json({
    id: note.id,
    authorName: note.authorName,
    body: note.body,
    pinned: note.pinned,
    createdAt: note.createdAt.toISOString(),
  });
}
