import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const Body = z.object({
  status: z.enum(["READY", "PICKED_UP", "CANCELED"]),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const order = await db.preOrder.findUnique({ where: { id: ctx.params.id } });
  if (!order || order.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const data: Record<string, unknown> = { status: parsed.status };
  if (parsed.status === "READY") data.readyAt = new Date();
  if (parsed.status === "PICKED_UP") data.pickedUpAt = new Date();

  await db.preOrder.update({ where: { id: order.id }, data });
  return NextResponse.json({ ok: true });
}
