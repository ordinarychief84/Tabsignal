import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "";

function key(): Uint8Array {
  if (!SECRET) {
    throw new Error("NEXTAUTH_SECRET is not set");
  }
  return new TextEncoder().encode(SECRET);
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
const SESSION_TTL = "30d";

export async function signLinkToken(claims: Omit<LinkClaims, "jti"> & { jti?: string }): Promise<string> {
  const jti = claims.jti ?? randomUUID();
  return new SignJWT({ ...claims, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(LINK_TTL)
    .sign(key());
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
