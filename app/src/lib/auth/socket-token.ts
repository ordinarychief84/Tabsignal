import { SignJWT, jwtVerify } from "jose";

const SECRET = process.env.NEXTAUTH_SECRET ?? "";
const TTL = "10m";

export type SocketScope = {
  venueId?: string;
  staffId?: string;
  guestSessionId?: string;
};

function key(): Uint8Array {
  if (!SECRET) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(SECRET);
}

/**
 * Mint a short-lived JWT that the browser passes to Socket.io. The Fastify
 * realtime backend verifies it with the same secret and only allows the
 * client to join the rooms named in the claims.
 */
export async function signSocketToken(scope: SocketScope): Promise<string> {
  return new SignJWT({ kind: "socket", ...scope })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifySocketToken(token: string): Promise<(SocketScope & { kind: "socket" }) | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "socket") return null;
    return payload as unknown as SocketScope & { kind: "socket" };
  } catch {
    return null;
  }
}
