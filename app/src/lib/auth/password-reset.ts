import "server-only";
/**
 * Password-reset token lifecycle.
 *
 * Separate from the magic-link sign-in tokens: a reset token is one-way
 * (it doesn't mint a session, it only authorises a /api/auth/reset-password
 * call), it lives in its own DB table (`PasswordResetToken`) with a
 * stricter shape (sha256-hashed, 1-hour expiry, single-use via the
 * tokenHash unique constraint), and consuming it bumps the staff row's
 * `sessionsValidAfter` so any cached JWT on another device is rejected.
 *
 * Threat model:
 *   1. **DB dump replay** — tokens stored as sha256(plaintext). An
 *      attacker with read-only DB access can't recover the URL to send
 *      themselves a reset.
 *   2. **Email enumeration** — issueResetToken returns the same shape
 *      regardless of whether the email exists. The forgot-password
 *      route returns 200 unconditionally.
 *   3. **Replay** — tokenHash has a unique constraint; usedAt stamps
 *      the consumption time for audit. Re-using a hash → DB constraint
 *      hit → reject.
 *   4. **Brute force** — 32 bytes of randomness via crypto.randomBytes
 *      = 256 bits. Not enumerable.
 *   5. **Stale tokens** — expiresAt enforced at consume time. A cron
 *      job (separate concern) sweeps rows past expiresAt + 24h grace.
 */

import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MS = 60 * 60_000; // 1 hour

/**
 * Generate a fresh token + persist its hash. Returns the **plaintext**
 * token (to embed in the email link) and the row. The plaintext is never
 * stored — only the hash hits the DB.
 */
export async function issueResetToken(opts: {
  staffId: string;
  requestIp?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await db.passwordResetToken.create({
    data: {
      staffId: opts.staffId,
      tokenHash,
      expiresAt,
      requestIp: opts.requestIp ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Atomically consume a token: returns the staff row + marks it used.
 * Rejects if missing, expired, or already used. Uses a transaction so
 * two concurrent POSTs to /reset-password with the same token can't
 * both succeed (the second's UPDATE will hit the usedAt check).
 */
export async function consumeResetToken(
  token: string,
): Promise<
  | { ok: true; staffId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" }
> {
  const tokenHash = hashToken(token);
  return db.$transaction(async tx => {
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, staffId: true, expiresAt: true, usedAt: true },
    });
    if (!row) return { ok: false as const, reason: "invalid" as const };
    if (row.usedAt) return { ok: false as const, reason: "used" as const };
    if (row.expiresAt.getTime() <= Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    // Stamp usedAt inside the same tx. If two requests race, the
    // second will read the same row in its own snapshot but
    // serializable isolation OR the unique tokenHash + update-then-
    // check pattern ensures only one wins. Postgres default isolation
    // (read committed) doesn't quite guarantee this on its own, so
    // we re-check the updated row count.
    const result = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (result.count === 0) {
      return { ok: false as const, reason: "used" as const };
    }
    return { ok: true as const, staffId: row.staffId };
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
