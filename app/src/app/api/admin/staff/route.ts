import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { signLinkToken } from "@/lib/auth/token";
import { sendMagicLinkEmail } from "@/lib/auth/email";
import { isVenueManager } from "@/lib/auth/venue-role";
import { appOrigin } from "@/lib/origin";

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  send: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Manager-only: a bartender shouldn't be able to add a co-conspirator
  // and grant them magic-link access to the manager dashboard.
  if (!(await isVenueManager(session, session.venueId))) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Only managers can add staff." },
      { status: 403 },
    );
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const email = parsed.email.toLowerCase().trim();
  const venue = await db.venue.findUnique({
    where: { id: session.venueId },
    select: { id: true, name: true },
  });
  if (!venue) return NextResponse.json({ error: "VENUE_NOT_FOUND" }, { status: 404 });

  // Idempotent: if email already exists, just return existing record (no error).
  const existing = await db.staffMember.findUnique({ where: { email } });
  if (existing && existing.venueId !== venue.id) {
    return NextResponse.json({ error: "EMAIL_ALREADY_USED_AT_OTHER_VENUE" }, { status: 409 });
  }

  const staff = existing ?? await db.staffMember.create({
    data: { venueId: venue.id, email, name: parsed.name },
  });

  let devLink: string | null = null;
  if (parsed.send) {
    const token = await signLinkToken({ kind: "link", staffId: staff.id, email });
    const link = `${appOrigin(req)}/api/auth/callback?token=${encodeURIComponent(token)}`;
    try {
      await sendMagicLinkEmail({
        to: email,
        staffName: staff.name,
        venueName: venue.name,
        link,
      });
    } catch (err) {
      const allowDevLinks = process.env.TABSIGNAL_DEV_LINKS === "true" || process.env.NODE_ENV === "development";
      if (allowDevLinks) {
        console.warn("[admin/staff] email send failed; surfacing devLink", (err as Error).message);
        devLink = link;
      }
    }
  }

  return NextResponse.json({
    id: staff.id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    devLink,
  });
}

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const staff = await db.staffMember.findMany({
    where: { venueId: session.venueId },
    orderBy: { createdAt: "asc" },
    include: { ackedRequests: { select: { id: true } } },
  });

  return NextResponse.json({
    items: staff.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      ackedCount: s.ackedRequests.length,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}
