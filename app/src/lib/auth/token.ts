import { SignJWT, jwtVerify } from "jose";

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

export async function signLinkToken(claims: LinkClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(LINK_TTL)
    .sign(key());
}

export async function verifyLinkToken(token: string): Promise<LinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "link") return null;
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
