import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { hashPairCode, signWearToken } from "@/lib/auth/wear";

/**
 * POST /api/wear/claim — exchange a pairing code for a device token.
 *
 * Unauthenticated by design (the watch has no credentials yet), so the
 * defenses are: 6-digit code space + sha256 lookup, single-use claim via
 * conditional update, 10-minute TTL, and a tight per-IP rate limit that
 * makes brute-forcing the code space infeasible inside the TTL.
 */
const Body = z.object({
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
  // What the staff console shows in the paired-devices list.
  name: z.string().trim().min(1).max(60).default("Watch"),
  platform: z.string().trim().min(1).max(24).default("other"),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const gate = await rateLimitAsync(`wear:claim:ip:${ip}`, { windowMs: 60 * 60_000, max: 15 });
  if (!gate.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs }, { status: 429 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  const row = await db.wearPairCode.findUnique({
    where: { codeHash: hashPairCode(parsed.code) },
  });
  // One generic error for wrong / expired / used codes — a prober learns
  // nothing about which digits exist.
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "CODE_INVALID" }, { status: 401 });
  }

  // Single-use: conditional claim beats a double-submit race.
  const claim = await db.wearPairCode.updateMany({
    where: { id: row.id, claimedAt: null },
    data: { claimedAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json({ error: "CODE_INVALID" }, { status: 401 });
  }

  const staff = await db.staffMember.findUnique({
    where: { id: row.staffId },
    select: {
      id: true,
      name: true,
      status: true,
      venue: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!staff || staff.status !== "ACTIVE") {
    return NextResponse.json({ error: "STAFF_INACTIVE" }, { status: 403 });
  }

  const device = await db.wearDevice.create({
    data: {
      staffId: staff.id,
      name: parsed.name,
      platform: parsed.platform.toLowerCase(),
    },
  });

  const token = await signWearToken({ kind: "wear", deviceId: device.id, staffId: staff.id });

  return NextResponse.json(
    {
      apiVersion: 1,
      token,
      device: { id: device.id, name: device.name, platform: device.platform },
      staff: { id: staff.id, name: staff.name },
      venue: { name: staff.venue.name, slug: staff.venue.slug },
    },
    { status: 201 },
  );
}
