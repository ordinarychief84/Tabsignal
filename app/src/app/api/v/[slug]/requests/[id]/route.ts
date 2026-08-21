import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Status of one request, for the guest who raised it.
 *
 * Exists so the guest UI can tell "we passed it on" apart from "a person
 * has seen it and is coming". Only the second is a promise, and only a
 * real acknowledgement by staff makes it true.
 *
 * Authorised by the session token from the QR, compared in constant time —
 * the same scheme the rest of the guest surface uses. Deliberately returns
 * the status and nothing else: no staff name, no note history, no ids.
 * A guest phone is a device someone else may pick up.
 */

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: { slug: string; id: string } },
) {
  const token = new URL(req.url).searchParams.get("s");
  if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 401 });

  const request = await db.request.findUnique({
    where: { id: ctx.params.id },
    select: {
      id: true,
      status: true,
      acknowledgedAt: true,
      resolvedAt: true,
      session: { select: { sessionToken: true } },
      venue: { select: { slug: true } },
    },
  });
  // Same response for "no such request" and "not yours" so the endpoint
  // can't be used to probe which request ids exist.
  if (!request || request.venue.slug !== ctx.params.slug) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!tokensEqual(token, request.session.sessionToken)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    status: request.status,
    acknowledgedAt: request.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  });
}
