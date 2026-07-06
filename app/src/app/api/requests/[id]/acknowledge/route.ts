import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { acknowledgeRequest } from "@/domain/requests/lifecycle";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // First-acker-wins CAS + realtime emit live in domain/requests/lifecycle
  // (shared with the wear surface since PR 1.4).
  const result = await acknowledgeRequest(session, ctx.params.id);
  if (!result.ok) {
    const status =
      result.error === "NOT_FOUND" ? 404 :
      result.error === "FORBIDDEN" ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  const r = result.request;
  if (result.alreadyAcked) {
    return NextResponse.json({
      id: r.id,
      status: r.status,
      acknowledgedAt: r.acknowledgedAt,
      acknowledgedBy: r.acknowledgedById ? { name: r.ackedByName } : null,
      alreadyAcked: true,
    });
  }

  // Return the full ack record so the optimistic-update on the staff queue
  // can render the Hand off button immediately. The bug we fixed: the
  // client was filling acknowledgedBy.id with "" because the response only
  // carried {id,status}, which made the "is this mine?" check fail and
  // hide the Hand off button until the next poll/socket update.
  return NextResponse.json({
    id: r.id,
    status: r.status,
    acknowledgedAt: r.acknowledgedAt,
    acknowledgedById: r.acknowledgedById,
    acknowledgedBy: r.acknowledgedById ? { id: r.acknowledgedById, name: r.ackedByName } : null,
  });
}
