import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

/**
 * Partial venue settings update. Only fields the manager can self-serve
 * are accepted; structural changes (slug, posType wiring) stay
 * concierge-only.
 */
const Body = z.object({
  googlePlaceId: z.string().max(120).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  logoUrl: z.string().url().max(2048).nullable().optional(),
  requireIdOnFirstDrink: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true },
  });
  if (!venue) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 }
    );
  }

  // Distinguish "field absent in body" (don't change) from "explicit null"
  // (clear it). `parsed.x !== undefined` is precise; the previous `"x" in
  // parsed` form was brittle if Zod ever emitted undefined-valued keys.
  const data: Record<string, string | boolean | null> = {};
  if (parsed.googlePlaceId !== undefined) data.googlePlaceId = parsed.googlePlaceId;
  if (parsed.brandColor !== undefined) data.brandColor = parsed.brandColor;
  if (parsed.logoUrl !== undefined) data.logoUrl = parsed.logoUrl;
  if (parsed.requireIdOnFirstDrink !== undefined) data.requireIdOnFirstDrink = parsed.requireIdOnFirstDrink;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  }

  const updated = await db.venue.update({
    where: { id: venue.id },
    data,
    select: {
      id: true,
      googlePlaceId: true,
      brandColor: true,
      logoUrl: true,
      requireIdOnFirstDrink: true,
    },
  });

  return NextResponse.json(updated);
}
