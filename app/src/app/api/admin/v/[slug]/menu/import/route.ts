import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { normalizeTags } from "@/lib/menu-discovery";
import { audit } from "@/lib/audit";
import { originGuard } from "@/lib/csrf";
import { getStaffSession } from "@/lib/auth/session";

/**
 * Bulk menu import.
 *
 * Takes items the client already parsed and previewed (lib/menu-import
 * runs in the editor so nothing is written before the venue has seen
 * exactly what it will create). Re-validates everything here anyway: the
 * preview is a convenience, not a security boundary.
 *
 * Categories are matched by name, case-insensitively, and created when
 * missing — a venue importing "## Pizza" twice gets one Pizza category,
 * not two.
 *
 * Not a replace. Import ADDS; it never deletes what's already there,
 * because someone pasting a section of their menu into a venue that
 * already has items is the common case and silently wiping the rest
 * would be catastrophic and unrecoverable.
 */

const Item = z.object({
  name: z.string().trim().min(1).max(120),
  priceCents: z.number().int().min(0).max(10_000_000),
  description: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(24)).max(8).optional(),
  category: z.string().trim().max(80).nullable().optional(),
});

const Body = z.object({
  items: z.array(Item).min(1).max(500),
});

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const gate = await gateAdminRoute(ctx.params.slug, "growth", "menu.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors.map(x => `${x.path.join(".")}: ${x.message}`).join("; ") : "";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  // Resolve categories up front so N items don't cost N lookups.
  const existing = await db.menuCategory.findMany({
    where: { venueId: gate.venueId },
    select: { id: true, name: true, sortOrder: true },
  });
  const byName = new Map(existing.map(c => [c.name.trim().toLowerCase(), c.id]));
  let nextSort = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0);

  const wanted = [
    ...new Set(
      parsed.items
        .map(i => i.category?.trim())
        .filter((c): c is string => Boolean(c))
        .map(c => c.toLowerCase()),
    ),
  ];
  const createdCategories: string[] = [];
  for (const lower of wanted) {
    if (byName.has(lower)) continue;
    const original =
      parsed.items.find(i => i.category?.trim().toLowerCase() === lower)?.category?.trim() ?? lower;
    const created = await db.menuCategory.create({
      data: { venueId: gate.venueId, name: original.slice(0, 80), sortOrder: ++nextSort },
      select: { id: true },
    });
    byName.set(lower, created.id);
    createdCategories.push(original);
  }

  // Sort order continues from what's already on the menu, so an import
  // lands after existing items instead of interleaving with them.
  const lastItem = await db.menuItem.findFirst({
    where: { venueId: gate.venueId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let sortOrder = lastItem?.sortOrder ?? 0;

  const created = await db.menuItem.createMany({
    data: parsed.items.map(item => ({
      venueId: gate.venueId,
      name: item.name,
      description: item.description ?? null,
      priceCents: item.priceCents,
      categoryId: item.category ? byName.get(item.category.trim().toLowerCase()) ?? null : null,
      tags: normalizeTags(item.tags),
      sortOrder: ++sortOrder,
    })),
  });

  // The gate already proved authorisation; this is only for the trail.
  // If it somehow returns null the import still stands — an audit gap is
  // not a reason to throw away work the venue just did.
  const session = await getStaffSession();
  if (session) {
    void audit({
      venueId: gate.venueId,
      actor: session,
      action: "menu.imported",
      targetType: "Venue",
      targetId: gate.venueId,
      metadata: { items: created.count, categoriesCreated: createdCategories.length },
    });
  }

  return NextResponse.json({
    ok: true,
    itemsCreated: created.count,
    categoriesCreated: createdCategories,
  });
}
