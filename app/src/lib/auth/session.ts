import { cookies } from "next/headers";
import { verifySessionToken, type SessionClaims } from "./token";

export const SESSION_COOKIE = "tabsignal_session";

/**
 * Read the current staff session from the cookie. Returns null if missing or invalid.
 * Server-side only — uses next/headers.
 */
export async function getStaffSession(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions(maxAgeDays = 30) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * maxAgeDays,
  };
}
