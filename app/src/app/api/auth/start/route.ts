import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";

const Body = z.object({
  email: z.string().email(),
  next: z.string().optional(),
});

function originFromRequest(req: Request): string {
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = fwdHost ?? req.headers.get("host");
  if (host) {
    const proto = fwdProto ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  const email = parsed.email.toLowerCase().trim();

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
    const link = `${originFromRequest(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;
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
      const allowDevLinks = process.env.TABSIGNAL_DEV_LINKS === "true" || process.env.NODE_ENV === "development";
      if (allowDevLinks) {
        console.warn("[auth/start] email send failed, returning link in response", (err as Error).message);
        return NextResponse.json({ ok: true, devLink: link });
      }
      console.warn("[auth/start] email send failed", (err as { statusCode?: number }).statusCode);
    }
  }

  return NextResponse.json({ ok: true });
}
