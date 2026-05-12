import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { verifySessionToken } from "@/lib/auth/token";
import { originGuard } from "@/lib/csrf";
import { IMPERSONATION_STASH_COOKIE } from "@/lib/auth/impersonation";

/**
 * Counterpart to /api/operator/impersonate. Reads the stash cookie set
 * when impersonation began and swaps it back in as the primary session,
 * letting the operator return to their own identity in one click rather
 * than logging out + signing back in.
 *
 * Security: same-origin only (originGuard). The stash cookie is HttpOnly +
 * SameSite=Strict so it cannot be set or read by another origin. If the
 * stash is missing/expired/invalid we clear the current session and bounce
 * the user back to /staff/login — better to fail closed than restore a
 * questionable session.
 */
export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const stash = cookies().get(IMPERSONATION_STASH_COOKIE)?.value;
  if (!stash) {
    const res = NextResponse.json(
      { error: "NO_STASH", detail: "No impersonation session to restore." },
      { status: 401 },
    );
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  // Validate that the stash is still a parseable session token before we
  // honour it. A tampered or expired stash falls through to the same
  // "clear + bounce to login" path.
  const claims = await verifySessionToken(stash);
  if (!claims) {
    const res = NextResponse.json(
      { error: "INVALID_STASH", detail: "Stashed session is invalid or expired." },
      { status: 401 },
    );
    res.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    res.cookies.set(IMPERSONATION_STASH_COOKIE, "", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  const res = NextResponse.json({ ok: true, redirectTo: "/operator" });
  res.cookies.set(SESSION_COOKIE, stash, sessionCookieOptions(30));
  res.cookies.set(IMPERSONATION_STASH_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
