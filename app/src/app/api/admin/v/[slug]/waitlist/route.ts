import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { sendSms } from "@/lib/sms";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const queue = await db.waitlist.findMany({
    where: { venueId: gate.venueId, status: { in: ["WAITING", "NOTIFIED"] } },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({
    queue: queue.map(w => ({
      id: w.id,
      partySize: w.partySize,
      guestName: w.guestName,
      guestPhone: w.guestPhone,
      quotedWaitMin: w.quotedWaitMin,
      joinedAt: w.joinedAt.toISOString(),
      notifiedAt: w.notifiedAt?.toISOString() ?? null,
      status: w.status,
    })),
  });
}

const NotifyBody = z.object({
  id: z.string(),
});

// POST = "notify next party that their table is ready". Sends SMS + flips
// the entry to NOTIFIED.
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = NotifyBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const entry = await db.waitlist.findFirst({
    where: { id: parsed.id, venueId: gate.venueId, status: "WAITING" },
  });
  if (!entry) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await db.waitlist.update({
    where: { id: entry.id },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });

  void sendSms(
    entry.guestPhone,
    `Your table is ready at TabCall. Please come to the host stand within the next 10 minutes.`
  );

  return NextResponse.json({ ok: true });
}
