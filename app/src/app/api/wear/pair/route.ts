import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { rateLimitAsync } from "@/lib/rate-limit";
import { hashPairCode, newPairCode, PAIR_CODE_TTL_MS } from "@/lib/auth/wear";

/**
 * POST /api/wear/pair — mint a 6-digit watch pairing code.
 *
 * Cookie-authenticated (the staff member's phone/console session). The
 * code is shown on their phone, typed on the watch, and claimed at
 * /api/wear/claim. Single-use, 10-minute TTL, stored hashed. Minting a
 * new code invalidates any unclaimed ones so only the latest works.
 */
export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // A waiter re-trying a flaky pairing shouldn't get locked out, but a
  // scripted loop shouldn't be able to mint codes forever.
  const gate = await rateLimitAsync(`wear:pair:${session.staffId}`, {
    windowMs: 60 * 60_000,
    max: 20,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs }, { status: 429 });
  }

  const code = newPairCode();
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MS);

  await db.$transaction([
    // Only the newest unclaimed code should work — fewer live secrets,
    // and the UI can say "this replaces any earlier code".
    db.wearPairCode.deleteMany({
      where: { staffId: session.staffId, claimedAt: null },
    }),
    db.wearPairCode.create({
      data: { staffId: session.staffId, codeHash: hashPairCode(code), expiresAt },
    }),
  ]);

  return NextResponse.json({
    code,
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: Math.floor(PAIR_CODE_TTL_MS / 1000),
  });
}
