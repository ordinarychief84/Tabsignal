import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Wearable-device auth for the /api/wear/* surface (see sdk/tabcall-wear).
 *
 * Watches can't do magic-link email or type passwords, so pairing works
 * like a TV login: the staff member generates a 6-digit code on their
 * already-authenticated phone, types it on the watch, and the watch
 * receives a long-lived bearer JWT (kind:"wear") bound to a WearDevice
 * row. Every wear request re-reads that row, so:
 *
 *   - "Revoke" in the staff console kills a lost watch on its next call
 *   - re-pairing bumps tokenIssuedAt and orphans older tokens
 *   - suspending/deleting the staff member cuts the watch off too
 *   - "Sign out everywhere" (sessionsValidAfter) also applies
 */

const WEAR_TOKEN_TTL = "180d";
export const PAIR_CODE_TTL_MS = 10 * 60_000;

function key(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type WearClaims = {
  kind: "wear";
  deviceId: string;
  staffId: string;
};

export async function signWearToken(claims: WearClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(WEAR_TOKEN_TTL)
    .sign(key());
}

async function verifyWearToken(token: string): Promise<(WearClaims & { iat: number }) | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "wear") return null;
    if (typeof payload.deviceId !== "string" || typeof payload.staffId !== "string") return null;
    if (typeof payload.iat !== "number") return null;
    return payload as unknown as WearClaims & { iat: number };
  } catch {
    return null;
  }
}

export function hashPairCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** 6-digit numeric code — the easiest thing to type on a 40mm screen. */
export function newPairCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type WearAuth = {
  deviceId: string;
  staffId: string;
  venueId: string;
  staffName: string;
  role: string;
};

export type WearAuthFail = { error: string; status: number };

/**
 * Authenticate a wear request from its Authorization: Bearer header.
 * Token signature is necessary but not sufficient — the device row and
 * the staff row must both still be in good standing.
 */
export async function getWearAuth(req: Request): Promise<WearAuth | WearAuthFail> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: "UNAUTHORIZED", status: 401 };

  const claims = await verifyWearToken(token);
  if (!claims) return { error: "UNAUTHORIZED", status: 401 };

  const device = await db.wearDevice.findUnique({
    where: { id: claims.deviceId },
    include: {
      staff: {
        select: {
          id: true,
          venueId: true,
          name: true,
          role: true,
          status: true,
          sessionsValidAfter: true,
        },
      },
    },
  });
  if (!device || device.staffId !== claims.staffId) {
    return { error: "DEVICE_NOT_FOUND", status: 401 };
  }
  if (device.revokedAt) return { error: "DEVICE_REVOKED", status: 401 };

  // iat is seconds; allow 5s skew against the DB stamp. Tokens minted
  // before the device's tokenIssuedAt (i.e. before the latest re-pair)
  // are dead, as are tokens older than a staff-wide sign-out-everywhere.
  const iatMs = claims.iat * 1000;
  if (iatMs + 5_000 < device.tokenIssuedAt.getTime()) {
    return { error: "TOKEN_ROTATED", status: 401 };
  }
  if (device.staff.sessionsValidAfter && iatMs + 5_000 < device.staff.sessionsValidAfter.getTime()) {
    return { error: "SIGNED_OUT_EVERYWHERE", status: 401 };
  }
  if (device.staff.status !== "ACTIVE") {
    return { error: "STAFF_INACTIVE", status: 403 };
  }

  // Presence stamp, throttled to one write per 5 minutes per device so
  // a 10s poll loop doesn't turn into write amplification.
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  void db.wearDevice
    .updateMany({
      where: {
        id: device.id,
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: staleBefore } }],
      },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => { /* presence is best-effort */ });

  return {
    deviceId: device.id,
    staffId: device.staff.id,
    venueId: device.staff.venueId,
    staffName: device.staff.name,
    role: device.staff.role,
  };
}

export function isWearAuthFail(a: WearAuth | WearAuthFail): a is WearAuthFail {
  return "error" in a;
}
