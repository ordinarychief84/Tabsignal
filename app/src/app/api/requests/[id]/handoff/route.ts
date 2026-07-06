import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { handoffRequest } from "@/domain/requests/lifecycle";

/**
 * Reassign an acknowledged request to a different staff member at the same
 * venue. Use when a server's shift ends mid-service or they need to
 * delegate. The original `acknowledgedAt` is preserved (we only swap the
 * acker), so SLA timing isn't reset.
 */
const Body = z.object({
  toStaffId: z.string().min(1),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const result = await handoffRequest(session, ctx.params.id, parsed.toStaffId);
  if (!result.ok) {
    const status =
      result.error === "NOT_FOUND" ? 404 :
      result.error === "FORBIDDEN" ? 403 :
      result.error === "NOT_ACKNOWLEDGED" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const r = result.request;
  if (result.noChange) {
    return NextResponse.json({
      id: r.id,
      status: r.status,
      acknowledgedById: r.acknowledgedById,
      noChange: true,
    });
  }

  return NextResponse.json({
    id: r.id,
    status: r.status,
    acknowledgedById: r.acknowledgedById,
  });
}
