import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";

const Body = z.object({ email: z.string().email() });

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
    const token = await signLinkToken({ kind: "link", staffId: staff.id, email });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const link = `${base}/api/auth/callback?token=${encodeURIComponent(token)}`;
    try {
      await sendMagicLinkEmail({
        to: email,
        staffName: staff.name,
        venueName: staff.venue.name,
        link,
      });
    } catch (err) {
      // In dev with no Resend key, surface the link in the response so testing
      // doesn't grind to a halt. Production should never hit this path.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[auth/start] email send failed, returning link in response", (err as Error).message);
        return NextResponse.json({ ok: true, devLink: link });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
