import { createHash, randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";

/**
 * Tier 3c: 6-digit OTP for guest profile identification.
 * Codes are SHA-256 hashed at rest. 5-minute TTL. 5 attempts max.
 */

const TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function code6(): string {
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function issueOtp(phone: string): Promise<{ ok: true; mocked?: boolean } | { ok: false; reason: string }> {
  // Throttle: at most 3 unconsumed OTPs in the last hour for a phone.
  const recent = await db.guestProfileOtp.count({
    where: {
      phone,
      createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
    },
  });
  if (recent >= 3) return { ok: false, reason: "RATE_LIMITED" };

  const code = code6();
  await db.guestProfileOtp.create({
    data: {
      phone,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const sms = await sendSms(phone, `Your TabCall verification code is ${code}. Expires in 5 minutes.`);
  if (!sms.ok) return { ok: false, reason: sms.reason };
  return { ok: true, mocked: "mocked" in sms ? sms.mocked : undefined };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "EXPIRED" | "ATTEMPTS_EXHAUSTED" | "MISMATCH" | "NOT_FOUND" };

// Verify a code against the most-recent unconsumed OTP for this phone.
// Increments the attempts counter on every mismatch; consumes on success.
export async function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  const otp = await db.guestProfileOtp.findFirst({
    where: { phone, consumed: false },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return { ok: false, reason: "NOT_FOUND" };
  if (otp.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "ATTEMPTS_EXHAUSTED" };
  }

  if (hash(code) !== otp.codeHash) {
    await db.guestProfileOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "MISMATCH" };
  }

  await db.guestProfileOtp.update({
    where: { id: otp.id },
    data: { consumed: true },
  });
  return { ok: true };
}
