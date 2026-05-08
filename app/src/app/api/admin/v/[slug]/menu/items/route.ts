import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

async function gateVenue(slug: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false as const, status: 401, body: { error: "UNAUTHORIZED" } };
  const venue = await db.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  if (venue.id !== session.venueId) return { ok: false as const, status: 403, body: { error: "FORBIDDEN" } };
  return { ok: true as const, venueId: venue.id };
}

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateVenue(ctx.params.slug);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const items = await db.menuItem.findMany({
    where: { venueId: gate.venueId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { category: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    items: items.map(i => ({
      id: i.id,
      name: i.name,
      description: i.description,
      priceCents: i.priceCents,
      isActive: i.isActive,
      sortOrder: i.sortOrder,
      ageRestricted: i.ageRestricted,
      imageUrl: i.imageUrl,
      categoryId: i.categoryId,
      categoryName: i.category?.name ?? null,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(10000000),
  categoryId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
  ageRestricted: z.boolean().default(false),
  imageUrl: z.string().url().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateVenue(ctx.params.slug);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = CreateBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" }, { status: 400 }); }

  // If a category is provided, ensure it belongs to this venue.
  if (parsed.categoryId) {
    const cat = await db.menuCategory.findUnique({ where: { id: parsed.categoryId } });
    if (!cat || cat.venueId !== gate.venueId) {
      return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
    }
  }

  const created = await db.menuItem.create({
    data: {
      venueId: gate.venueId,
      name: parsed.name,
      description: parsed.description ?? null,
      priceCents: parsed.priceCents,
      categoryId: parsed.categoryId ?? null,
      sortOrder: parsed.sortOrder,
      isActive: parsed.isActive,
      ageRestricted: parsed.ageRestricted,
      imageUrl: parsed.imageUrl ?? null,
    },
  });
  return NextResponse.json({ id: created.id });
}
