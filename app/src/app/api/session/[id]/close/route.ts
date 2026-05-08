import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guest-initiated "start fresh" — closes the current session so the next
 * QR scan creates a new one. Two ways to authorize: the session's secret
 * token (for the guest who owns the tab) or an authenticated staff
 * session at the same venue (for the manager/server clearing a stale tab).
 *
 * The session isn't deleted; we just expire it. Old line items + requests
 * stay in the DB for analytics.
 */
const Body = z.object({
  sessionToken: z.string().min(1).optional(),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let parsed;
  try { parsed = Body.parse(await req.json().catch(() => ({}))); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const session = await db.guestSession.findUnique({ where: { id: ctx.params.id } });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  // Either the session token matches OR (future: staff session check).
  // Staff-side close ships when we add a "clear tab" action to the manager
  // dashboard; for now guest-initiated only.
  if (!parsed.sessionToken || !tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ ok: true, alreadyClosed: true });
  }

  await db.guestSession.update({
    where: { id: session.id },
    data: { expiresAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
