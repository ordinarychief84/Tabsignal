import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { randomUUID } from "node:crypto";

// Resolved lazily so tests can inject NEXTAUTH_SECRET via beforeAll AND
// Next.js's build-time "collect page data" phase doesn't crash when the
// secret hasn't been wired into the build environment. Production reads
// it at first sign / verify call.
function key(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export type LinkClaims = {
  kind: "link";
  staffId: string;
  email: string;
  jti: string;
  next?: string;
};

export type SessionClaims = {
  kind: "session";
  staffId: string;
  venueId: string;
  email: string;
  role: string;
};

const LINK_TTL = "15m";
// Invite links live longer than sign-in links: a bartender invited during
// the manager's morning admin session often doesn't open the email until
// their shift starts. Still single-use (jti burned on redemption), so the
// longer window doesn't allow replay.
const INVITE_LINK_TTL = "7d";
const SESSION_TTL = "30d";

export async function signLinkToken(
  claims: Omit<LinkClaims, "jti"> & { jti?: string },
  opts?: { ttl?: "15m" | "7d" },
): Promise<string> {
  const jti = claims.jti ?? randomUUID();
  return new SignJWT({ ...claims, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(opts?.ttl ?? LINK_TTL)
    .sign(key());
}

/** Sugar for staff-invite links — same claims shape, 7-day expiry. */
export async function signInviteToken(claims: Omit<LinkClaims, "jti"> & { jti?: string }): Promise<string> {
  return signLinkToken(claims, { ttl: INVITE_LINK_TTL });
}

export async function verifyLinkToken(token: string): Promise<LinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "link") return null;
    if (typeof payload.jti !== "string" || !payload.jti) return null;
    return payload as unknown as LinkClaims;
  } catch {
    return null;
  }
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(key());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "session") return null;
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}

/**
 * Raw payload (including `iat`) for the session-validity check that
 * happens layered on top in lib/auth/session.ts. Splits the responsibility
 * cleanly: JWT signature validity here; sessionsValidAfter comparison there.
 */
export async function verifySessionTokenWithIat(token: string): Promise<(SessionClaims & { iat?: number }) | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "session") return null;
    return payload as JWTPayload as SessionClaims & { iat?: number };
  } catch {
    return null;
  }
}
