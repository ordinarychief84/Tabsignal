import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { events } from "@/lib/realtime";
import { getWearAuth, isWearAuthFail } from "@/lib/auth/wear";

/**
 * POST /api/wear/requests/[id]/resolve — close out a request from the
 * watch. Mirrors /api/requests/[id]/resolve: the resolution action is
 * required (the watch UI shows a compact picker), resolve is idempotent,
 * and the CAS prevents a second tap from overwriting resolvedAt.
 */
const Body = z.object({
  action: z.enum(["SERVED", "COMPED", "REFUSED", "ESCALATED", "NOT_ACTIONABLE", "OTHER"]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await getWearAuth(req);
  if (isWearAuthFail(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "ACTION_REQUIRED", detail: e instanceof Error ? e.message : "Pick an action." },
      { status: 400 },
    );
  }

  const existing = await db.request.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (existing.venueId !== auth.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (existing.status === "RESOLVED") {
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
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
    alreadyResolved: false,
  });
}
