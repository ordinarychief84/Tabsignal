import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

// Either toggle is optional — body must specify at least one field.
const Body = z.object({
  seen: z.boolean().optional(),
  flagged: z.boolean().optional(),
}).refine(b => b.seen !== undefined || b.flagged !== undefined, {
  message: "must include `seen` and/or `flagged`",
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  // Match the rest of the admin surface: STAFF (legacy) is normalised to
  // OWNER for permission checks. Reviews PATCH is gated by reviews.respond
  // — only managers + owners should be flipping flags on the audit trail.
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "reviews.respond")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't update reviews." },
      { status: 403 }
    );
  }

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

  // Partial update — only touch fields the caller sent. `flagged` carries
  // its own timestamp so the operator audit screen can show when each
  // flag was raised without joining against AuditLog.
  const data: Record<string, unknown> = {};
  if (parsed.seen !== undefined) data.seenByMgr = parsed.seen;
  if (parsed.flagged !== undefined) {
    data.flagged = parsed.flagged;
    data.flaggedAt = parsed.flagged ? new Date() : null;
  }

  const updated = await db.feedbackReport.update({
    where: { id: fb.id },
    data,
  });
  return NextResponse.json({
    id: updated.id,
    seen: updated.seenByMgr,
    flagged: updated.flagged,
    flaggedAt: updated.flaggedAt?.toISOString() ?? null,
  });
}
