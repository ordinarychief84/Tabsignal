import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { signSocketToken } from "@/lib/auth/socket-token";

/**
 * Mint a short-lived socket-auth token. The browser includes it in the
 * Socket.io connection's `auth.token`, and the Fastify realtime backend
 * uses it to authorize which rooms the client can join.
 *
 * Two callers:
 *   - Staff PWA / admin pages: pass nothing; we read the cookie session
 *     and grant access to staff:{me} + venue:{my venue}.
 *   - Guest browser: pass { guestSessionId, sessionToken }; we verify the
 *     sessionToken against the GuestSession row before signing.
 */

const Body = z.object({
  guestSessionId: z.string().min(1).optional(),
  sessionToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  let parsed;
  try { parsed = Body.parse(await req.json().catch(() => ({}))); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Guest path
  if (parsed.guestSessionId) {
    if (!parsed.sessionToken) {
      return NextResponse.json({ error: "MISSING_SESSION_TOKEN" }, { status: 400 });
    }
    const guest = await db.guestSession.findUnique({
      where: { id: parsed.guestSessionId },
      select: { id: true, sessionToken: true, expiresAt: true },
    });
    if (!guest || guest.sessionToken !== parsed.sessionToken) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (guest.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
    }
    const token = await signSocketToken({ guestSessionId: guest.id });
    return NextResponse.json({ token });
  }

  // Staff path (default)
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const token = await signSocketToken({
    venueId: session.venueId,
    staffId: session.staffId,
  });
  return NextResponse.json({ token });
}
