import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

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
  const origin = originFromRequest(req);
  const res = NextResponse.redirect(`${origin}/staff/login`, { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
