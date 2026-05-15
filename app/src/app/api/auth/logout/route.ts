import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin-auth";
import { originGuard } from "@/lib/csrf";

function originFromRequest(req: Request): string {
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = fwdHost ?? req.headers.get("host");
  if (host) {
    const proto = fwdProto ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function POST(req: Request) {
  // Block CSRF: SameSite=Strict already prevents most cross-origin POSTs,
  // but the logout form is a plain HTML form submit (no Origin in some
  // WebViews). Belt + braces — refuse the request if the Origin header
  // doesn't look like us.
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const origin = originFromRequest(req);
  const res = NextResponse.redirect(`${origin}/staff/login`, { status: 303 });
  // Clear BOTH cookies — a single sign-out should kill both the staff
  // and admin sessions for the same browser. Otherwise a super admin
  // who clicked Sign out in /operator would still be authenticated via
  // the surviving admin cookie on the next page load.
  const clear = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(SESSION_COOKIE, "", clear);
  res.cookies.set(ADMIN_SESSION_COOKIE, "", clear);
  return res;
}
