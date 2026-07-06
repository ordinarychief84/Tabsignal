import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { resolveRequest } from "@/domain/requests/lifecycle";

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

  // Idempotent resolve CAS + realtime emit live in domain/requests/lifecycle.
  const result = await resolveRequest(session, ctx.params.id, parsed.action, parsed.note);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "NOT_FOUND" ? 404 : 403 });
  }

  const r = result.request;
  if (result.alreadyResolved) {
    return NextResponse.json({
      id: r.id,
      status: r.status,
      resolvedAt: r.resolvedAt,
      resolutionAction: r.resolutionAction,
      alreadyResolved: true,
    });
  }

  return NextResponse.json({
    id: r.id,
    status: r.status,
    resolutionAction: r.resolutionAction,
  });
}
