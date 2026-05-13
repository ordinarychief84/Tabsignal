import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { can } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";

async function gateItem(slug: string, itemId: string) {
  const gate = await gateAdminRoute(slug, "growth", "menu.edit");
  if (!gate.ok) return gate;
  const item = await db.menuItem.findUnique({ where: { id: itemId } });
  if (!item || item.venueId !== gate.venueId) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  return { ok: true as const, venueId: gate.venueId, item };
}

/**
 * Variant of gateItem that requires only the feature-toggle permission.
 * Used when the PATCH body is a pure isFeatured flip — a venue can give
 * a manager-tier role the ability to feature/un-feature without granting
 * full menu.edit. Falls through to the regular menu.edit gate if the
 * body contains anything else.
 */
async function gateItemForFeatureOnly(slug: string, itemId: string) {
  const session = await getStaffSession();
  if (!session) return { ok: false as const, status: 401, body: { error: "UNAUTHORIZED" } };
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  const gate = await gateAdminRoute(slug, "growth");
  if (!gate.ok) return gate;
  if (!can(effectiveRole, "menu.feature_toggle")) {
    return {
      ok: false as const,
      status: 403,
      body: { error: "FORBIDDEN", detail: "Your role can't toggle featured." },
    };
  }
  const item = await db.menuItem.findUnique({ where: { id: itemId } });
  if (!item || item.venueId !== gate.venueId) return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  return { ok: true as const, venueId: gate.venueId, item };
}

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).max(10000000).optional(),
  categoryId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  // Separate permission gate — see below. Optional so existing callers
  // (rename, repriced, 86) keep working without sending it.
  isFeatured: z.boolean().optional(),
  ageRestricted: z.boolean().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  // Distinguish "feature-toggle only" vs "real edit". A body containing
  // only isFeatured (plus zero other fields) is allowed for roles that
  // have menu.feature_toggle but not menu.edit. Mixed bodies fall under
  // the stricter menu.edit gate.
  const keys = Object.keys(parsed).filter(k => (parsed as Record<string, unknown>)[k] !== undefined);
  const featureOnly = keys.length === 1 && keys[0] === "isFeatured";

  const gate = featureOnly
    ? await gateItemForFeatureOnly(ctx.params.slug, ctx.params.id)
    : await gateItem(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

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
