import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

/**
 * Partial venue settings update. Only fields the manager can self-serve
 * are accepted; structural changes (slug, posType wiring) stay
 * concierge-only.
 */
const Body = z.object({
  // Identity (newly editable)
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(240).nullable().optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/).nullable().optional(),
  timezone: z.string().min(1).max(60).optional(),
  // Reviews + branding
  googlePlaceId: z.string().max(120).nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  // Restrict to our Supabase Storage origin so a manager can't point logoUrl
  // at an arbitrary host (tracking pixel, NSFW image, expired CDN). The logo
  // upload endpoint writes through Supabase and returns a URL from this
  // origin; this PATCH is for clearing (null) or re-pointing within the
  // bucket. Allow null unconditionally.
  logoUrl: z
    .string()
    .url()
    .max(2048)
    .refine(
      url => {
        const allowed = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!allowed) return false;
        try {
          const u = new URL(url);
          const a = new URL(allowed);
          return u.origin === a.origin && u.pathname.startsWith("/storage/v1/object/public/");
        } catch {
          return false;
        }
      },
      { message: "logoUrl must be a Supabase Storage public object URL" }
    )
    .nullable()
    .optional(),
  requireIdOnFirstDrink: z.boolean().optional(),
  // Notification routing — comma-separated emails or null to clear.
  alertEmails: z.string().max(500).nullable().optional(),
  // Guest UX copy. Short — these render inline in mobile views, so the
  // 240-char cap keeps a long-winded paragraph from pushing the action
  // buttons off-screen. Null falls back to the baked-in defaults the
  // guest UI ships with.
  guestWelcomeMessage: z.string().max(240).nullable().optional(),
  guestConfirmationMessage: z.string().max(240).nullable().optional(),
  reviewPrompt: z.string().max(240).nullable().optional(),
  // Per-shift kill switches.
  requestsEnabled: z.boolean().optional(),
  preorderEnabled: z.boolean().optional(),
  reservationsEnabled: z.boolean().optional(),
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
  // Normalise legacy STAFF (venue creator pre-RBAC backfill) into OWNER for
  // the permission check — see lib/auth/venue-role.ts for the full rationale.
  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "venue.edit_settings")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't edit venue settings." },
      { status: 403 }
    );
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
  if (parsed.name !== undefined) data.name = parsed.name;
  if (parsed.address !== undefined) data.address = parsed.address;
  if (parsed.zipCode !== undefined) data.zipCode = parsed.zipCode;
  if (parsed.timezone !== undefined) data.timezone = parsed.timezone;
  if (parsed.googlePlaceId !== undefined) data.googlePlaceId = parsed.googlePlaceId;
  if (parsed.brandColor !== undefined) data.brandColor = parsed.brandColor;
  if (parsed.logoUrl !== undefined) data.logoUrl = parsed.logoUrl;
  if (parsed.requireIdOnFirstDrink !== undefined) data.requireIdOnFirstDrink = parsed.requireIdOnFirstDrink;
  if (parsed.alertEmails !== undefined) data.alertEmails = parsed.alertEmails;
  if (parsed.guestWelcomeMessage !== undefined) data.guestWelcomeMessage = parsed.guestWelcomeMessage;
  if (parsed.guestConfirmationMessage !== undefined) data.guestConfirmationMessage = parsed.guestConfirmationMessage;
  if (parsed.reviewPrompt !== undefined) data.reviewPrompt = parsed.reviewPrompt;
  if (parsed.requestsEnabled !== undefined) data.requestsEnabled = parsed.requestsEnabled;
  if (parsed.preorderEnabled !== undefined) data.preorderEnabled = parsed.preorderEnabled;
  if (parsed.reservationsEnabled !== undefined) data.reservationsEnabled = parsed.reservationsEnabled;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "NOTHING_TO_UPDATE" }, { status: 400 });
  }

  const updated = await db.venue.update({
    where: { id: venue.id },
    data,
    select: {
      id: true,
      name: true,
      address: true,
      zipCode: true,
      timezone: true,
      googlePlaceId: true,
      brandColor: true,
      logoUrl: true,
      requireIdOnFirstDrink: true,
      alertEmails: true,
      guestWelcomeMessage: true,
      guestConfirmationMessage: true,
      reviewPrompt: true,
      requestsEnabled: true,
      preorderEnabled: true,
      reservationsEnabled: true,
    },
  });

  return NextResponse.json(updated);
}
