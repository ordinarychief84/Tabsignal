import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";
import { appOrigin } from "@/lib/origin";
import { rateLimitAsync } from "@/lib/rate-limit";

const Body = z.object({
  email: z.string().email(),
  next: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const email = parsed.email.toLowerCase().trim();

  // Throttle by email and by IP. Without this an attacker can mailbomb a
  // staff inbox or burn Resend quota by spamming /auth/start. Limits run
  // through the shared Upstash-backed limiter so they survive Vercel cold
  // starts; both gates fail-open if Upstash isn't configured.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const emailGate = await rateLimitAsync(`auth-start:email:${email}`, { windowMs: 60 * 60_000, max: 8 });
  const ipGate    = await rateLimitAsync(`auth-start:ip:${ip}`,        { windowMs: 60 * 60_000, max: 30 });
  if (!emailGate.ok || !ipGate.ok) {
    // Same 200 shape as the success path so we don't leak which email
    // address tripped the limiter (would otherwise enable enumeration).
    console.warn("[auth/start] rate limited", { email, ip, emailGate, ipGate });
    return NextResponse.json({ ok: true });
  }

  // Look up by email. If not found, still return 200 — never reveal whether
  // the email belongs to a registered staff member.
  const staff = await db.staffMember.findUnique({
    where: { email },
    include: { venue: { select: { name: true } } },
  });

  if (staff) {
    const token = await signLinkToken({
      kind: "link",
      staffId: staff.id,
      email,
      ...(parsed.next ? { next: parsed.next } : {}),
    });
    const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;
    try {
      await sendMagicLinkEmail({
        to: email,
        staffName: staff.name,
        venueName: staff.venue.name,
        link,
      });
    } catch (err) {
      // In dev (TABSIGNAL_DEV_LINKS opt-in OR NODE_ENV !== production), surface
      // the link in the response so testing doesn't grind to a halt. Production
      // must never hit this path — gate strictly so a misconfigured preview
      // doesn't leak tokens in HTTP bodies.
      const e = err as { statusCode?: number; message?: string };
      console.error("[auth/start] email send failed", {
        email,
        statusCode: e.statusCode,
        message: e.message,
      });
      const allowDevLinks = process.env.TABSIGNAL_DEV_LINKS === "true" || process.env.NODE_ENV === "development";
      if (allowDevLinks) {
        return NextResponse.json({ ok: true, devLink: link });
      }
      // Production: still return 200 to avoid email enumeration. The
      // structured `console.error` above lights up Vercel logs so the
      // failure is observable.
    }
  }

  return NextResponse.json({ ok: true });
}
