import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";

// Required action picker. The staff queue UI shows these as a small
// menu after tapping "Resolve" so we always know WHAT happened, not
// just THAT it happened.
const Body = z.object({
  action: z.enum(["SERVED", "COMPED", "REFUSED", "ESCALATED", "NOT_ACTIONABLE", "OTHER"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // The action is required so we can track what each staff member
  // actually did and time-track the resolution properly.
  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "ACTION_REQUIRED", detail: e instanceof Error ? e.message : "Pick an action: served / comped / refused / escalated / not actionable / other." },
      { status: 400 }
    );
  }

  const existing = await db.request.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Idempotent resolve: if already RESOLVED, return the original timestamp
  // and skip the realtime emit. Otherwise compare-and-swap on non-resolved
  // status so a second tap can't overwrite resolvedAt.
  if (existing.status === "RESOLVED") {
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      resolvedAt: existing.resolvedAt?.toISOString() ?? null,
      resolutionAction: existing.resolutionAction,
      alreadyResolved: true,
    });
  }

  const data: Prisma.RequestUpdateManyMutationInput = {
    status: "RESOLVED",
    resolvedAt: new Date(),
    resolutionAction: parsed.action,
    resolutionNote: parsed.note ?? null,
  };
  const cas = await db.request.updateMany({
    where: { id: existing.id, status: { not: "RESOLVED" } },
    data,
  });

  if (cas.count === 0) {
    const cur = await db.request.findUnique({ where: { id: existing.id } });
    return NextResponse.json({
      id: cur?.id,
      status: cur?.status,
      resolvedAt: cur?.resolvedAt?.toISOString() ?? null,
      resolutionAction: cur?.resolutionAction,
      alreadyResolved: true,
    });
  }

  const updated = await db.request.findUnique({ where: { id: existing.id } });
  if (!updated) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  void events.requestResolved(updated.venueId, {
    id: updated.id,
    status: updated.status,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    resolutionAction: updated.resolutionAction,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    resolutionAction: updated.resolutionAction,
  });
}
