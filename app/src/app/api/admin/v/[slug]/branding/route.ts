import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";

export const runtime = "nodejs";

/**
 * Lock image URLs (logo, banner) to our Supabase Storage origin so a
 * manager can't point a stored URL at an arbitrary host — same defense
 * as /api/admin/v/[slug] PATCH on Venue.logoUrl. The upload endpoints
 * write through Supabase and return a URL from this origin; this PATCH
 * is for clearing (null) or rotating between two Supabase paths.
 */
function isSupabaseStorageUrl(url: string): boolean {
  const allowed = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!allowed) return false;
  try {
    const u = new URL(url);
    const a = new URL(allowed);
    return u.origin === a.origin && u.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

const supabaseUrl = z
  .string()
  .url()
  .max(2048)
  .refine(isSupabaseStorageUrl, {
    message: "must be a Supabase Storage public object URL",
  })
  .nullable()
  .optional();

const Body = z.object({
  logoUrl: supabaseUrl,
  bannerImageUrl: supabaseUrl,
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  fontFamily: z.string().max(60).nullable().optional(),
  welcomeMessage: z.string().max(240).nullable().optional(),
});

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "branding.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const branding = await db.venueBranding.findUnique({
    where: { venueId: gate.venueId },
  });

  // Always return the same shape so the client doesn't have to
  // distinguish "no row yet" from "all fields null".
  return NextResponse.json({
    venueId: gate.venueId,
    logoUrl: branding?.logoUrl ?? null,
    bannerImageUrl: branding?.bannerImageUrl ?? null,
    primaryColor: branding?.primaryColor ?? null,
    secondaryColor: branding?.secondaryColor ?? null,
    accentColor: branding?.accentColor ?? null,
    fontFamily: branding?.fontFamily ?? null,
    welcomeMessage: branding?.welcomeMessage ?? null,
  });
}

export async function PATCH(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "branding.manage");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" },
      { status: 400 },
    );
  }

  // Distinguish "absent" (don't change) from "null" (clear). We build
  // an explicit map to keep the upsert payload tight on writes.
  const data: Record<string, string | null> = {};
  if (parsed.logoUrl !== undefined) data.logoUrl = parsed.logoUrl;
  if (parsed.bannerImageUrl !== undefined) data.bannerImageUrl = parsed.bannerImageUrl;
  if (parsed.primaryColor !== undefined) data.primaryColor = parsed.primaryColor;
  if (parsed.secondaryColor !== undefined) data.secondaryColor = parsed.secondaryColor;
  if (parsed.accentColor !== undefined) data.accentColor = parsed.accentColor;
  if (parsed.fontFamily !== undefined) data.fontFamily = parsed.fontFamily;
  if (parsed.welcomeMessage !== undefined) data.welcomeMessage = parsed.welcomeMessage;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  }

  // venueId is UNIQUE — upsert keeps the GET/PATCH cycle to one row.
  const row = await db.venueBranding.upsert({
    where: { venueId: gate.venueId },
    create: { venueId: gate.venueId, ...data },
    update: data,
  });

  return NextResponse.json({
    venueId: row.venueId,
    logoUrl: row.logoUrl,
    bannerImageUrl: row.bannerImageUrl,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    accentColor: row.accentColor,
    fontFamily: row.fontFamily,
    welcomeMessage: row.welcomeMessage,
  });
}
