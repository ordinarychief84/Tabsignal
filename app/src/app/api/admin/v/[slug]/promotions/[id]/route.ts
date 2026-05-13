import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

const PROMOTION_TYPES = [
  "HAPPY_HOUR",
  "BUSINESS_LUNCH",
  "BANNER",
  "LIMITED_TIME_ITEM",
  "NEW_ITEM",
  "DISCOUNT_HIGHLIGHT",
] as const;

const PROMOTION_STATUSES = ["ACTIVE", "INACTIVE", "EXPIRED"] as const;

const PatchBody = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(PROMOTION_TYPES).optional(),
  bannerImageUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  status: z.enum(PROMOTION_STATUSES).optional(),
  // If passed, REPLACES the entire menuItem links set. Pass [] to clear.
  menuItemIds: z.array(z.string().min(1)).max(200).optional(),
});

async function gatePromotion(slug: string, id: string) {
  const gate = await gateAdminRoute(slug, "free", "promotions.manage");
  if (!gate.ok) return gate;
  const promotion = await db.promotion.findUnique({ where: { id } });
  if (!promotion || promotion.venueId !== gate.venueId) {
    return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  }
  return { ok: true as const, venueId: gate.venueId, promotion };
}

export async function PATCH(req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gatePromotion(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 }
    );
  }

  // Combine patch + current row before validating the window so partial
  // updates still get checked end-to-end.
  const nextStarts = parsed.startsAt === undefined
    ? gate.promotion.startsAt
    : (parsed.startsAt ? new Date(parsed.startsAt) : null);
  const nextEnds = parsed.endsAt === undefined
    ? gate.promotion.endsAt
    : (parsed.endsAt ? new Date(parsed.endsAt) : null);
  if (nextStarts && nextEnds && nextEnds <= nextStarts) {
    return NextResponse.json(
      { error: "INVALID_WINDOW", detail: "endsAt must be after startsAt" },
      { status: 400 }
    );
  }

  // Validate ownership of any new menu items up-front so we don't half-
  // commit (delete the old links, then 400 on the replacement set).
  if (parsed.menuItemIds && parsed.menuItemIds.length > 0) {
    const owned = await db.menuItem.findMany({
      where: { id: { in: parsed.menuItemIds }, venueId: gate.venueId },
      select: { id: true },
    });
    if (owned.length !== parsed.menuItemIds.length) {
      return NextResponse.json({ error: "INVALID_MENU_ITEMS" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.title !== undefined) data.title = parsed.title;
  if (parsed.description !== undefined) data.description = parsed.description;
  if (parsed.type !== undefined) data.type = parsed.type;
  if (parsed.bannerImageUrl !== undefined) data.bannerImageUrl = parsed.bannerImageUrl;
  if (parsed.startsAt !== undefined) data.startsAt = parsed.startsAt ? new Date(parsed.startsAt) : null;
  if (parsed.endsAt !== undefined) data.endsAt = parsed.endsAt ? new Date(parsed.endsAt) : null;
  if (parsed.status !== undefined) data.status = parsed.status;

  await db.$transaction(async tx => {
    await tx.promotion.update({ where: { id: ctx.params.id }, data });
    if (parsed.menuItemIds !== undefined) {
      // Replace the entire links set. The UNIQUE(promotionId, menuItemId)
      // constraint means dedup naturally falls out of "deleteMany + createMany".
      await tx.promotionItem.deleteMany({ where: { promotionId: ctx.params.id } });
      if (parsed.menuItemIds.length > 0) {
        await tx.promotionItem.createMany({
          data: parsed.menuItemIds.map(menuItemId => ({
            promotionId: ctx.params.id,
            menuItemId,
          })),
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; id: string } }) {
  const gate = await gatePromotion(ctx.params.slug, ctx.params.id);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // PromotionItem rows cascade off the FK with onDelete: Cascade, so a
  // straight delete on the parent is fine.
  await db.promotion.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
