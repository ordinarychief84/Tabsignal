import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const categories = await db.menuCategory.findMany({
    where: { venueId: gate.venueId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  return NextResponse.json({
    items: categories.map(c => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      itemCount: c._count.items,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = CreateBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const created = await db.menuCategory.create({
    data: { venueId: gate.venueId, ...parsed },
  });
  return NextResponse.json({ id: created.id });
}
