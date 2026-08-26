import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { markOnMyWay } from "@/domain/requests/lifecycle";

/**
 * "I'm walking over."
 *
 * The second half of the split that made the guest-facing promise
 * honest. Acknowledging claims a request; this says the server has
 * actually left what they were doing — and only this is allowed to tell
 * a guest that somebody is crossing the room.
 *
 * Sits beside acknowledge/ and resolve/ rather than becoming a mode of
 * either, so each transition keeps its own CSRF guard, its own
 * permission check and its own timestamp. The rules live in
 * domain/requests/lifecycle, shared with the wear surface.
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const result = await markOnMyWay(session, ctx.params.id);
  if (!result.ok) {
    const status =
      result.error === "NOT_FOUND" ? 404 :
      result.error === "FORBIDDEN" ? 403 :
      // NOT_ACKNOWLEDGED and ALREADY_RESOLVED are both "the request isn't
      // in a state where this makes sense", which is a conflict rather
      // than a client error in the request itself.
      409;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    id: result.request.id,
    status: result.request.status,
    onMyWayAt: result.request.onMyWayAt,
    alreadyOnMyWay: result.alreadyOnMyWay,
  });
}
