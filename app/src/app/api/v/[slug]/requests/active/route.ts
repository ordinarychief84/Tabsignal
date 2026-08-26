import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * The guest's own live request, if they have one.
 *
 * The sibling route (`requests/[id]`) answers "what happened to THIS
 * request", which only helps a tab that already knows the id. That id
 * lived in React state, so a guest who locked their phone, reopened it
 * and pulled to refresh lost every trace of having asked for anything —
 * the status card vanished and the only recovery was to ask again, which
 * puts a second row in front of the same server.
 *
 * This route re-derives it from the database instead: the newest request
 * on this session that nobody has finished yet. Server state, so it
 * survives a refresh, a browser restart, and the guest handing their
 * phone to someone else at the table.
 *
 * RESOLVED requests are excluded deliberately. A finished request is not
 * something to restore on load — the guest already saw the outcome when
 * it happened, and re-showing "all done" ten minutes later on a fresh
 * page load reads as a bug.
 *
 * Authorised by the QR session token, compared in constant time, and
 * returns nothing that isn't the guest's own: no staff name, no note
 * history, no ids beyond the request's own.
 */

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const url = new URL(req.url);
  const token = url.searchParams.get("s");
  const sessionId = url.searchParams.get("session");
  if (!token || !sessionId) {
    return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 401 });
  }

  const session = await db.guestSession.findUnique({
    where: { id: sessionId },
    select: {
      sessionToken: true,
      expiresAt: true,
      paidAt: true,
      venue: { select: { slug: true } },
    },
  });

  // One shape of failure for "no such session", "wrong venue" and "not
  // your session", so the endpoint can't be used to probe which session
  // ids exist or which venue one belongs to.
  if (!session || session.venue.slug !== ctx.params.slug) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!tokensEqual(token, session.sessionToken)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (session.expiresAt.getTime() <= Date.now() || session.paidAt) {
    // An over session has no live request by definition. 200 with null
    // rather than an error: the guest page polls this, and a dead tab
    // should quietly stop showing a card, not surface an error state.
    return NextResponse.json({ request: null });
  }

  const active = await db.request.findFirst({
    where: {
      sessionId,
      // PENDING, ACKNOWLEDGED and ESCALATED are all still open from the
      // guest's chair. RESOLVED is finished — see the note above.
      status: { in: ["PENDING", "ACKNOWLEDGED", "ESCALATED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      note: true,
      createdAt: true,
      acknowledgedAt: true,
    },
  });

  if (!active) return NextResponse.json({ request: null });

  return NextResponse.json({
    request: {
      id: active.id,
      type: active.type,
      status: active.status,
      note: active.note,
      createdAt: active.createdAt.toISOString(),
      acknowledgedAt: active.acknowledgedAt?.toISOString() ?? null,
    },
  });
}
