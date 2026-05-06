import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

const SECRET = process.env.NEXTAUTH_SECRET ?? "";
const TTL = "24h";

export type CompClaims = {
  kind: "comp";
  jti: string;
  sessionId: string;
  venueId: string;
  amountCents: number;
  tableLabel: string;
};

function key(): Uint8Array {
  if (!SECRET) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(SECRET);
}

/**
 * Mint a signed comp action token. Embedded in the bad-rating email's
 * "Comp $20 to Table 7" CTA. JWT carries a single-use jti; the apply
 * endpoint inserts it into the CompAction table on success.
 */
export async function signCompToken(claims: Omit<CompClaims, "kind" | "jti"> & { jti?: string }): Promise<string> {
  const jti = claims.jti ?? randomUUID();
  return new SignJWT({ kind: "comp", ...claims, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifyCompToken(token: string): Promise<CompClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "comp") return null;
    if (typeof payload.jti !== "string" || !payload.jti) return null;
    return payload as unknown as CompClaims;
  } catch {
    return null;
  }
}
