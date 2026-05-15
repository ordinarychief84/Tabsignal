/**
 * Password sign-in for StaffMember rows.
 *
 * Magic-link is still the default path; password is an opt-in upgrade.
 * The two coexist:
 *   - rows with passwordHash=null   → magic-link only (existing behaviour)
 *   - rows with passwordHash set    → can use either email+password or
 *                                     magic-link
 *
 * Password sign-in refuses to mint a session until `emailVerifiedAt`
 * is set. The first successful magic-link sign-in stamps that field
 * (see /api/auth/callback). New password-only signups (future flow)
 * would need a separate verification email — not in this PR.
 *
 * Crypto: bcryptjs at work factor 12 (~250ms hash). Same primitives as
 * the PlatformAdmin password feature shipped in PR #33.
 */

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const BCRYPT_WORK_FACTOR = 12;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

export async function hashStaffPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  }
  return bcrypt.hash(password, BCRYPT_WORK_FACTOR);
}

export async function verifyStaffPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/* ---------------------------------------------------------------------- */
/* Login                                                                  */
/* ---------------------------------------------------------------------- */

export type LoginResult =
  | {
      ok: true;
      staff: {
        id: string;
        venueId: string;
        email: string;
        role: string;
      };
    }
  | { ok: false; reason: "invalid" | "no_password" | "unverified" | "suspended" };

/**
 * Verify email + password against the StaffMember row. Constant-time-
 * resistant: runs bcrypt.compare on a dummy hash when the row is
 * missing OR has no password set, so unknown-email, no-password, and
 * wrong-password all take the same time.
 */
export async function loginStaffWithPassword(
  email: string,
  password: string,
): Promise<LoginResult> {
  const normalized = email.toLowerCase().trim();
  const staff = await db.staffMember.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      venueId: true,
      email: true,
      role: true,
      status: true,
      passwordHash: true,
      emailVerifiedAt: true,
    },
  });

  // Pad the timing for missing-row + missing-password so callers can't
  // probe which emails are registered or which have set a password.
  const DUMMY_HASH = "$2a$12$abcdefghijklmnopqrstuv1234567890abcdefghijklmno";
  if (!staff) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }
  if (!staff.passwordHash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "no_password" };
  }
  if (staff.status === "SUSPENDED") {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "suspended" };
  }

  const match = await verifyStaffPassword(password, staff.passwordHash);
  if (!match) return { ok: false, reason: "invalid" };

  // Password sign-in REQUIRES a verified email. Magic-link sign-in
  // stamps emailVerifiedAt on the first successful click — so anyone
  // who set a password without ever clicking a magic link must verify
  // first. Callers handle the resend flow.
  if (!staff.emailVerifiedAt) {
    return { ok: false, reason: "unverified" };
  }

  return {
    ok: true,
    staff: {
      id: staff.id,
      venueId: staff.venueId,
      email: staff.email,
      role: staff.role,
    },
  };
}
