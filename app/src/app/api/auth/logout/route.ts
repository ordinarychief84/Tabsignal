import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
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
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
