import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/auth/email";
import { issueResetToken } from "@/lib/auth/password-reset";
import { appOrigin } from "@/lib/origin";

/**
 * POST /api/auth/forgot-password
 *
 * Public, unauthenticated endpoint. Accepts an email; if it matches an
 * active StaffMember, generates a one-hour single-use reset token and
 * emails a link to /reset-password?token=...
 *
 * Always returns 200 with the same body shape regardless of whether
 * the email exists — prevents enumeration. Rate-limited per email AND
 * per IP via the existing Upstash limiter.
 *
 * Distinct from /api/auth/start (magic-link sign-in): a reset token
 * doesn't mint a session, it only authorises one /reset-password call.
 */

const Body = z.object({
  email: z.string().email().max(200),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    const detail = err instanceof z.ZodError
      ? err.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")
      : "unparsable JSON";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  const email = parsed.email.toLowerCase().trim();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Throttling. Generous on email (5/hour — typo / "didn't get the
  // email" retries) and tighter on IP (15/hour) so a script can't
  // mailbomb every staff in a venue from one place.
  const emailGate = await rateLimitAsync(`pwreset:email:${email}`, {
    windowMs: 60 * 60_000,
    max: 5,
  });
  const ipGate = await rateLimitAsync(`pwreset:ip:${ip}`, {
    windowMs: 60 * 60_000,
    max: 15,
  });
  if (!emailGate.ok || !ipGate.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: emailGate.retryAfterMs ?? ipGate.retryAfterMs },
      { status: 429 },
    );
  }

  // Always return the same shape regardless of whether the email
  // exists. Logging and email dispatch happen async-after.
  void (async () => {
    try {
      const staff = await db.staffMember.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          venue: { select: { name: true } },
        },
      });
      // Silently no-op on:
      //   - unknown email
      //   - SUSPENDED / DELETED accounts (former employees shouldn't
      //     be able to reset themselves back in)
      //   - INVITED accounts that haven't accepted yet (they use the
      //     magic-link callback to accept, not the reset flow)
      //
      // The ACTIVE-only gate is deliberate and is mirrored at consume
      // time in /api/auth/reset-password (which re-checks status==ACTIVE
      // before writing the new hash), so a token issued to a now-inactive
      // account can't be redeemed. Note this means an INVITED user who
      // lost their invite link has no self-serve password recovery — they
      // must be re-invited by a manager. Expanding forgot-password to also
      // (re)activate INVITED accounts would change invite semantics and is
      // intentionally left out of scope here.
      if (!staff) return;
      if (staff.status !== "ACTIVE") return;
      const { token } = await issueResetToken({ staffId: staff.id, requestIp: ip });
      const link = `${appOrigin(req)}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail({
        to: staff.email,
        staffName: staff.name,
        venueName: staff.venue.name,
        link,
      });
    } catch (err) {
      // Don't let a token-write or email-send failure leak via the
      // response shape. Log it for ops.
      console.error("[auth/forgot-password]", err instanceof Error ? err.message : err);
    }
  })();

  return NextResponse.json({ ok: true });
}
