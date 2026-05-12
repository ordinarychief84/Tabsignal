import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const Body = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean().default(true),
});

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  // Specials are a Free-tier feature — no upsell value if it's gated.
  const gate = await gateAdminRoute(ctx.params.slug, "free");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const specials = await db.venueSpecial.findMany({
    where: { venueId: gate.venueId },
    orderBy: [{ active: "desc" }, { startsAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    specials: specials.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      priceCents: s.priceCents,
      startsAt: s.startsAt?.toISOString() ?? null,
      endsAt: s.endsAt?.toISOString() ?? null,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "specials.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 }
    );
  }

  // Window sanity: if both set, ends must be after starts.
  if (parsed.startsAt && parsed.endsAt && new Date(parsed.endsAt) <= new Date(parsed.startsAt)) {
    return NextResponse.json({ error: "INVALID_WINDOW", detail: "endsAt must be after startsAt" }, { status: 400 });
  }

  const created = await db.venueSpecial.create({
    data: {
      venueId: gate.venueId,
      title: parsed.title,
      description: parsed.description ?? null,
      priceCents: parsed.priceCents ?? null,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      active: parsed.active,
    },
  });

  return NextResponse.json({ id: created.id });
}
