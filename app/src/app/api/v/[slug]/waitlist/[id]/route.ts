import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateGuestVenuePlan } from "@/lib/plan-gate";
import { normalizePhone } from "@/lib/sms";

// Guest leave-the-list. Phone supplied as proof of ownership (matches
// the entry's stored phone).
export async function DELETE(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateGuestVenuePlan(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const url = new URL(req.url);
  const phoneParam = url.searchParams.get("phone");
  if (!phoneParam) return NextResponse.json({ error: "PHONE_REQUIRED" }, { status: 400 });
  const phone = normalizePhone(phoneParam);
  if (!phone) return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });

  const entry = await db.waitlist.findFirst({
    where: { id: ctx.params.id, venueId: gate.venueId },
    select: { id: true, guestPhone: true, status: true },
  });
  if (!entry) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (entry.guestPhone !== phone) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (entry.status !== "WAITING") {
    return NextResponse.json({ error: "ALREADY_CLOSED" }, { status: 410 });
  }

  await db.waitlist.update({
    where: { id: entry.id },
    data: { status: "ABANDONED" },
  });
  return NextResponse.json({ ok: true });
}
