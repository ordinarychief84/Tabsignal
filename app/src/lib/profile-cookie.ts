import { SignJWT, jwtVerify } from "jose";

/**
 * Tier 3c: 90-day profile cookie. Issued after a guest verifies a phone
 * OTP. Lets subsequent /v/[slug]/* visits look up the GuestProfile
 * without forcing another verification.
 */

const SECRET = process.env.NEXTAUTH_SECRET ?? "";
const TTL = "90d";

export const PROFILE_COOKIE = "tabcall_profile";

function key(): Uint8Array {
  if (!SECRET) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(SECRET);
}

export type ProfileClaims = {
  kind: "profile";
  profileId: string;
  phone: string;
};

export async function signProfileToken(claims: Omit<ProfileClaims, "kind">): Promise<string> {
  return new SignJWT({ ...claims, kind: "profile" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifyProfileToken(token: string): Promise<ProfileClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "profile") return null;
    return payload as unknown as ProfileClaims;
  } catch {
    return null;
  }
}

export function profileCookieOptions(maxAgeDays = 90) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * maxAgeDays,
  };
}
