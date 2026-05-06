import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

const Body = z.object({ seen: z.boolean() });

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const fb = await db.feedbackReport.findUnique({ where: { id: ctx.params.id } });
  if (!fb || fb.venueId !== venue.id) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const updated = await db.feedbackReport.update({
    where: { id: fb.id },
    data: { seenByMgr: parsed.seen },
  });
  return NextResponse.json({ id: updated.id, seen: updated.seenByMgr });
}
