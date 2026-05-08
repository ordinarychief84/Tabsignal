import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

async function gateCategory(slug: string, categoryId: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false as const, status: 401, body: { error: "UNAUTHORIZED" } };
  const venue = await db.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  if (venue.id !== session.venueId) return { ok: false as const, status: 403, body: { error: "FORBIDDEN" } };
  const cat = await db.menuCategory.findUnique({ where: { id: categoryId } });
  if (!cat || cat.venueId !== venue.id) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  return { ok: true as const, venueId: venue.id, category: cat };
}

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateCategory(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  await db.menuCategory.update({
    where: { id: ctx.params.id },
    data: parsed,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gateCategory(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Items keep their data but lose the categoryId (onDelete: SetNull).
  await db.menuCategory.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
