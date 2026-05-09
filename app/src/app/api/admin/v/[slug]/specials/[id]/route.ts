import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
});

async function gateSpecial(slug: string, id: string) {
  const gate = await gateAdminRoute(slug, "free");
  if (!gate.ok) return gate;
  const special = await db.venueSpecial.findUnique({ where: { id } });
  if (!special || special.venueId !== gate.venueId) {
    return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  }
  return { ok: true as const, venueId: gate.venueId, special };
}

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateSpecial(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 }
    );
  }

  // Resolve the next-state window with whatever the patch overrides + the
  // existing values, so we can validate the combination, not just the
  // newly-set fields.
  const nextStarts = parsed.startsAt === undefined
    ? gate.special.startsAt
    : (parsed.startsAt ? new Date(parsed.startsAt) : null);
  const nextEnds = parsed.endsAt === undefined
    ? gate.special.endsAt
    : (parsed.endsAt ? new Date(parsed.endsAt) : null);
  if (nextStarts && nextEnds && nextEnds <= nextStarts) {
    return NextResponse.json({ error: "INVALID_WINDOW", detail: "endsAt must be after startsAt" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.title !== undefined) data.title = parsed.title;
  if (parsed.description !== undefined) data.description = parsed.description;
  if (parsed.priceCents !== undefined) data.priceCents = parsed.priceCents;
  if (parsed.startsAt !== undefined) data.startsAt = parsed.startsAt ? new Date(parsed.startsAt) : null;
  if (parsed.endsAt !== undefined) data.endsAt = parsed.endsAt ? new Date(parsed.endsAt) : null;
  if (parsed.active !== undefined) data.active = parsed.active;

  await db.venueSpecial.update({ where: { id: ctx.params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateSpecial(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  await db.venueSpecial.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
