import { NextResponse } from "next/server";
import { z } from "zod";
import { getWearAuth, isWearAuthFail } from "@/lib/auth/wear";
import { resolveRequest } from "@/domain/requests/lifecycle";

/**
 * POST /api/wear/requests/[id]/resolve — close out a request from the
 * watch. Shares domain/requests/lifecycle with the console route: the
 * resolution action is required (the watch UI shows a compact picker),
 * resolve is idempotent, and the CAS prevents a second tap from
 * overwriting resolvedAt.
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

  const result = await resolveRequest(auth, ctx.params.id, parsed.action, parsed.note);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "NOT_FOUND" ? 404 : 403 });
  }

  const r = result.request;
  return NextResponse.json({
    id: r.id,
    status: r.status,
    resolutionAction: r.resolutionAction,
    alreadyResolved: result.alreadyResolved,
  });
}
