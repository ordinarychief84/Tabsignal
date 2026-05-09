/**
 * SMS adapter. Twilio is the production backend; in dev we no-op and log
 * so reservations / OTP flows are testable without burning Twilio credits.
 *
 * Anything that sends an SMS goes through this module so we have one place
 * to swap providers and one place to add rate limiting.
 */

import { env } from "@/lib/env";

export type SmsResult =
  | { ok: true; sid: string; mocked?: boolean }
  | { ok: false; reason: string };

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "TWILIO_NOT_CONFIGURED" };
    }
    // Dev / test: skip the network call and pretend it worked.
    console.info(`[sms:mock] to=${to} body=${body.slice(0, 80)}`);
    return { ok: true, sid: `mock_${Date.now()}`, mocked: true };
  }

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const res = await fetch(`${TWILIO_API}/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `TWILIO_${res.status}:${detail.slice(0, 200)}` };
    }
    const data = (await res.json()) as { sid: string };
    return { ok: true, sid: data.sid };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "FETCH_FAILED" };
  }
}

// Normalize a phone number to E.164 (rough — strips formatting, prefixes
// +1 for 10-digit US numbers). Real production would use libphonenumber.
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (input.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}
