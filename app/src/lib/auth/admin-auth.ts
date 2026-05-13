/**
 * Password-based sign-in for the TabCall super-admin console.
 *
 * Scope: this is platform-admin-only. Regular StaffMember rows continue
 * to sign in via magic link at /staff/login. Platform admins sign in at
 * /admin/login with email + password against the PlatformAdmin table.
 *
 * Crypto: bcryptjs (work factor 12 — ~250ms on modern hardware, slow
 * enough to make brute force expensive but fast enough that login
 * doesn't feel sluggish).
 *
 * Session: separate JWT + cookie from the staff session.
 *   - JWT kind = "admin"
 *   - cookie name = ADMIN_SESSION_COOKIE
 *   - iat checked against PlatformAdmin.passwordChangedAt on every read
 *     so password rotation invalidates older tokens (mirrors the
 *     `sessionsValidAfter` pattern on StaffMember).
 */

// Intentionally no `server-only` import — this module is exercised by
// unit tests as well as by server route handlers. Callers (API routes
// and Server Components) keep this server-side by default in Next's
// App Router; nothing client-side imports it.
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";

const ADMIN_SESSION_COOKIE = "tabsignal_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours — super admin shouldn't stay logged in for weeks

const BCRYPT_WORK_FACTOR = 12;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function jwtSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("NEXTAUTH_SECRET must be set and >= 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/* ---------------------------------------------------------------------- */
/* Password hashing                                                       */
/* ---------------------------------------------------------------------- */

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  return bcrypt.hash(password, BCRYPT_WORK_FACTOR);
}

/** Constant-time-ish password compare. Bcrypt's compare is already
 *  resistant to timing leaks for the hash portion. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/* ---------------------------------------------------------------------- */
/* Admin session JWT                                                      */
/* ---------------------------------------------------------------------- */

const AdminSessionClaims = z.object({
  kind: z.literal("admin"),
  adminId: z.string(),
  email: z.string().email(),
});

export type AdminSession = z.infer<typeof AdminSessionClaims> & {
  /** iat in seconds — used for password-rotation invalidation. */
  iat: number;
};

export async function signAdminSession(adminId: string, email: string): Promise<string> {
  return new SignJWT({ kind: "admin", adminId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

async function decodeAdminSession(token: string): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      algorithms: ["HS256"],
    });
    const parsed = AdminSessionClaims.safeParse(payload);
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      iat: typeof payload.iat === "number" ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* Cookie helpers                                                         */
/* ---------------------------------------------------------------------- */

export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

export { ADMIN_SESSION_COOKIE };

/**
 * Reads the admin session cookie (server-only), verifies the JWT, looks
 * up the PlatformAdmin row, and checks the password-rotation timestamp.
 * Returns null if any check fails — caller redirects to /admin/login.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await decodeAdminSession(token);
  if (!session) return null;

  // Verify the PlatformAdmin still exists, is not suspended, and the
  // token was minted AFTER any password rotation.
  const admin = await db.platformAdmin.findUnique({
    where: { id: session.adminId },
    select: {
      id: true,
      email: true,
      suspendedAt: true,
      passwordChangedAt: true,
    },
  });
  if (!admin) return null;
  if (admin.suspendedAt) return null;
  if (admin.email.toLowerCase() !== session.email.toLowerCase()) return null;
  if (admin.passwordChangedAt && admin.passwordChangedAt.getTime() / 1000 > session.iat) {
    // Password rotated after this JWT was minted → reject.
    return null;
  }
  return session;
}

/* ---------------------------------------------------------------------- */
/* Login + logout (used by the API routes)                                */
/* ---------------------------------------------------------------------- */

export type LoginResult =
  | { ok: true; adminId: string; email: string; token: string }
  | { ok: false; reason: "invalid" | "no_password" | "suspended" };

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const normalized = email.toLowerCase().trim();
  const admin = await db.platformAdmin.findUnique({
    where: { email: normalized },
    select: { id: true, email: true, passwordHash: true, suspendedAt: true },
  });
  // Run bcrypt anyway when the row is missing so unknown-email and
  // wrong-password take the same time (timing-attack resistance).
  if (!admin) {
    await bcrypt.compare(password, "$2a$12$abcdefghijklmnopqrstuv1234567890abcdefghijklmno");
    return { ok: false, reason: "invalid" };
  }
  if (admin.suspendedAt) {
    return { ok: false, reason: "suspended" };
  }
  if (!admin.passwordHash) {
    return { ok: false, reason: "no_password" };
  }
  const match = await verifyPassword(password, admin.passwordHash);
  if (!match) return { ok: false, reason: "invalid" };

  const token = await signAdminSession(admin.id, admin.email);
  // Stamp lastSeenAt; failure here doesn't block login.
  await db.platformAdmin
    .update({ where: { id: admin.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
  return { ok: true, adminId: admin.id, email: admin.email, token };
}
