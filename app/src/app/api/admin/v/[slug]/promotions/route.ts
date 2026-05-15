import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { rateLimitAsync } from "@/lib/rate-limit";

const PROMOTION_TYPES = [
  "HAPPY_HOUR",
  "BUSINESS_LUNCH",
  "BANNER",
  "LIMITED_TIME_ITEM",
  "NEW_ITEM",
  "DISCOUNT_HIGHLIGHT",
] as const;

const Body = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(PROMOTION_TYPES),
  bannerImageUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  menuItemIds: z.array(z.string().min(1)).max(200).optional(),
});

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "promotions.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Per-venue read cap. Audit Finding #14.
  const gateRl = await rateLimitAsync(`admin-get:promotions:${gate.venueId}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!gateRl.ok) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const promotions = await db.promotion.findMany({
    where: { venueId: gate.venueId },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, priceCents: true } },
        },
      },
    },
  });

  return NextResponse.json({
    promotions: promotions.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      type: p.type,
      bannerImageUrl: p.bannerImageUrl,
      startsAt: p.startsAt?.toISOString() ?? null,
      endsAt: p.endsAt?.toISOString() ?? null,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      items: p.items.map(it => ({
        id: it.id,
        menuItem: it.menuItem
          ? { id: it.menuItem.id, name: it.menuItem.name, priceCents: it.menuItem.priceCents }
          : null,
      })),
    })),
  });
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "promotions.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 }
    );
  }

  // Window sanity: if both set, endsAt must be strictly after startsAt.
  if (parsed.startsAt && parsed.endsAt && new Date(parsed.endsAt) <= new Date(parsed.startsAt)) {
    return NextResponse.json(
      { error: "INVALID_WINDOW", detail: "endsAt must be after startsAt" },
      { status: 400 }
    );
  }

  // If menu items were passed, verify each one belongs to this venue so a
  // crafted payload can't attach another venue's items to this promotion.
  if (parsed.menuItemIds && parsed.menuItemIds.length > 0) {
    const owned = await db.menuItem.findMany({
      where: { id: { in: parsed.menuItemIds }, venueId: gate.venueId },
      select: { id: true },
    });
    if (owned.length !== parsed.menuItemIds.length) {
      return NextResponse.json({ error: "INVALID_MENU_ITEMS" }, { status: 400 });
    }
  }

  const created = await db.promotion.create({
    data: {
      venueId: gate.venueId,
      title: parsed.title,
      description: parsed.description ?? null,
      type: parsed.type,
      bannerImageUrl: parsed.bannerImageUrl ?? null,
      startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
      endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
      items: parsed.menuItemIds && parsed.menuItemIds.length > 0
        ? {
            create: parsed.menuItemIds.map(menuItemId => ({ menuItemId })),
          }
        : undefined,
    },
  });

  return NextResponse.json({ id: created.id });
}
