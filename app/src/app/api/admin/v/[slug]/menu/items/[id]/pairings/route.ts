import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { isPairingRelationship, PAIRING_RELATIONSHIPS } from "@/lib/pairings";
import { audit } from "@/lib/audit";
import { getStaffSession } from "@/lib/auth/session";

/**
 * The pairings hanging off one menu item.
 *
 * This is where "pairs well with" actually gets authored. Nothing else
 * writes to MenuItemPairing, because nothing else is allowed to: TabCall
 * has no basket and no bill, so it cannot infer what goes with what, and
 * a suggestion the venue didn't make is a suggestion nobody can stand
 * behind.
 *
 * Both ends of every pairing are checked against the venue on the way in.
 * Without that an owner could point one of their dishes at an item on
 * somebody else's menu — and a guest would be shown a dish their kitchen
 * has never heard of, in a venue that never approved it.
 */

export const dynamic = "force-dynamic";

const MAX_PER_ITEM = 6;

export async function GET(
  _req: Request,
  ctx: { params: { slug: string; id: string } },
) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const source = await db.menuItem.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, venueId: true },
  });
  if (!source || source.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const pairings = await db.menuItemPairing.findMany({
    where: { menuItemId: ctx.params.id, venueId: gate.venueId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      suggestedId: true,
      relationship: true,
      sortOrder: true,
      suggested: { select: { name: true, isActive: true } },
    },
  });

  return NextResponse.json({
    pairings: pairings.map(p => ({
      id: p.id,
      suggestedId: p.suggestedId,
      suggestedName: p.suggested.name,
      // Surfaced so the editor can mark a suggestion that points at
      // something currently off the menu — the guest never sees it, and
      // an owner should know why.
      suggestedActive: p.suggested.isActive,
      relationship: p.relationship,
      sortOrder: p.sortOrder,
    })),
  });
}

const CreateBody = z.object({
  suggestedId: z.string().min(1),
  relationship: z
    .enum(PAIRING_RELATIONSHIPS as [string, ...string[]])
    .default("PAIRS_WITH"),
  sortOrder: z.number().int().min(0).max(100).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: { slug: string; id: string } },
) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth", "menu.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try {
    parsed = CreateBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" },
      { status: 400 },
    );
  }
  if (!isPairingRelationship(parsed.relationship)) {
    return NextResponse.json({ error: "INVALID_RELATIONSHIP" }, { status: 400 });
  }

  // Both ends, in one query, so a cross-venue target can't slip through
  // between two separate lookups.
  const ends = await db.menuItem.findMany({
    where: { id: { in: [ctx.params.id, parsed.suggestedId] } },
    select: { id: true, venueId: true },
  });
  const source = ends.find(e => e.id === ctx.params.id) ?? null;
  const target = ends.find(e => e.id === parsed.suggestedId) ?? null;

  // Same 404 for "isn't ours" and "doesn't exist", so this route can't be
  // used to discover which item ids exist at other venues.
  if (!source || source.venueId !== gate.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!target || target.venueId !== gate.venueId) {
    return NextResponse.json({ error: "INVALID_SUGGESTION" }, { status: 400 });
  }
  if (source.id === target.id) {
    return NextResponse.json({ error: "SELF_PAIRING" }, { status: 400 });
  }

  const existing = await db.menuItemPairing.count({
    where: { menuItemId: ctx.params.id },
  });
  if (existing >= MAX_PER_ITEM) {
    // A dish with a dozen suggestions has stopped recommending and
    // started listing. The guest surface only ever shows one anyway.
    return NextResponse.json(
      { error: "TOO_MANY", detail: `A dish can carry at most ${MAX_PER_ITEM} suggestions.` },
      { status: 400 },
    );
  }

  try {
    const created = await db.menuItemPairing.create({
      data: {
        venueId: gate.venueId,
        menuItemId: ctx.params.id,
        suggestedId: parsed.suggestedId,
        relationship: parsed.relationship,
        sortOrder: parsed.sortOrder ?? existing,
      },
      select: {
        id: true,
        suggestedId: true,
        relationship: true,
        sortOrder: true,
        suggested: { select: { name: true, isActive: true } },
      },
    });

    const session = await getStaffSession();
    if (session) {
      void audit({
        venueId: gate.venueId,
        actor: session,
        action: "menu.pairing.created",
        targetType: "MenuItemPairing",
        targetId: created.id,
        metadata: { menuItemId: ctx.params.id, suggestedId: parsed.suggestedId },
      });
    }

    return NextResponse.json(
      {
        pairing: {
          id: created.id,
          suggestedId: created.suggestedId,
          suggestedName: created.suggested.name,
          suggestedActive: created.suggested.isActive,
          relationship: created.relationship,
          sortOrder: created.sortOrder,
        },
      },
      { status: 201 },
    );
  } catch {
    // The unique index on (menuItemId, suggestedId) is the only realistic
    // failure here, and it means the venue already said this.
    return NextResponse.json({ error: "ALREADY_PAIRED" }, { status: 409 });
  }
}

const DeleteBody = z.object({ pairingId: z.string().min(1) });

export async function DELETE(
  req: Request,
  ctx: { params: { slug: string; id: string } },
) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth", "menu.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try {
    parsed = DeleteBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Scoped by venue AND by source item: a pairing id alone is not enough
  // to authorise deleting it.
  const result = await db.menuItemPairing.deleteMany({
    where: {
      id: parsed.pairingId,
      venueId: gate.venueId,
      menuItemId: ctx.params.id,
    },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const session = await getStaffSession();
  if (session) {
    void audit({
      venueId: gate.venueId,
      actor: session,
      action: "menu.pairing.deleted",
      targetType: "MenuItemPairing",
      targetId: parsed.pairingId,
      metadata: { menuItemId: ctx.params.id },
    });
  }

  return NextResponse.json({ ok: true });
}
