import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

async function gateItem(slug: string, itemId: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false as const, status: 401, body: { error: "UNAUTHORIZED" } };
  const venue = await db.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  if (venue.id !== session.venueId) return { ok: false as const, status: 403, body: { error: "FORBIDDEN" } };
  const item = await db.menuItem.findUnique({ where: { id: itemId } });
  if (!item || item.venueId !== venue.id) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  return { ok: true as const, venueId: venue.id, item };
}

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(10000000).optional(),
  categoryId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  ageRestricted: z.boolean().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateItem(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  if (parsed.categoryId) {
    const cat = await db.menuCategory.findUnique({ where: { id: parsed.categoryId } });
    if (!cat || cat.venueId !== gate.venueId) {
      return NextResponse.json({ error: "INVALID_CATEGORY" }, { status: 400 });
    }
  }

  await db.menuItem.update({
    where: { id: ctx.params.id },
    data: parsed,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateItem(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  await db.menuItem.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
