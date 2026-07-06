import { NextResponse } from "next/server";
import { getWearAuth, isWearAuthFail } from "@/lib/auth/wear";
import { acknowledgeRequest } from "@/domain/requests/lifecycle";

/**
 * POST /api/wear/requests/[id]/ack — "Got it" from the wrist.
 *
 * Same first-acker-wins CAS and realtime emit as the console route —
 * literally: both call domain/requests/lifecycle since PR 1.4. POST
 * (not PATCH) because several wearable HTTP stacks only speak GET/POST
 * well. Race losses come back as alreadyAcked with the winner's name —
 * a success state on the watch ("Dee got it"), not an error.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await getWearAuth(req);
  if (isWearAuthFail(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await acknowledgeRequest(auth, ctx.params.id);
  if (!result.ok) {
    const status =
      result.error === "NOT_FOUND" ? 404 :
      result.error === "FORBIDDEN" ? 403 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }

  const r = result.request;
  return NextResponse.json({
    id: r.id,
    status: r.status,
    mine: r.acknowledgedById === auth.staffId,
    ackedBy: r.ackedByName,
    alreadyAcked: result.alreadyAcked,
  });
}
