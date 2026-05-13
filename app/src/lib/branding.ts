/**
 * Venue branding resolver.
 *
 * The product has two parallel branding surfaces:
 *   1. The original `Venue.brandColor` / `Venue.logoUrl` /
 *      `Venue.guestWelcomeMessage` fields — flat columns directly on
 *      Venue, set via /settings.
 *   2. The newer `VenueBranding` table (1:1 with Venue, separate row) —
 *      spec-verbatim, supports primary/secondary/accent colors,
 *      font family, banner image, welcome message override.
 *
 * The new table layers on top of the legacy fields per-field. A guest
 * surface should always go through `getVenueBranding` + the resolver so
 * partial branding (only primary color set, no banner, etc.) falls back
 * gracefully to the legacy values instead of rendering as blank.
 */

import { db } from "@/lib/db";
import type { VenueBranding } from "@prisma/client";

export type ResolvedBranding = {
  logoUrl: string | null;
  bannerImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  welcomeMessage: string | null;
};

type VenueFallbackFields = {
  brandColor: string | null;
  logoUrl: string | null;
  guestWelcomeMessage: string | null;
};

/**
 * Load the VenueBranding row for a venue. Returns null if the venue has
 * never written any branding overrides. Callers should pipe the result
 * through `resolveBrandingWithFallback` along with the relevant Venue
 * fields so missing fields degrade to the legacy values.
 */
export async function getVenueBranding(venueId: string): Promise<VenueBranding | null> {
  return db.venueBranding.findUnique({ where: { venueId } });
}

/**
 * Merge VenueBranding (field-by-field overrides) onto the legacy Venue
 * columns. Any null field on VenueBranding falls through to its closest
 * legacy equivalent.
 *
 *   primaryColor   → Venue.brandColor
 *   logoUrl        → Venue.logoUrl
 *   welcomeMessage → Venue.guestWelcomeMessage
 *
 * Secondary/accent/font/banner have no legacy column and stay null.
 */
export function resolveBrandingWithFallback(
  venue: VenueFallbackFields,
  branding: VenueBranding | null,
): ResolvedBranding {
  return {
    logoUrl: branding?.logoUrl ?? venue.logoUrl ?? null,
    bannerImageUrl: branding?.bannerImageUrl ?? null,
    primaryColor: branding?.primaryColor ?? venue.brandColor ?? null,
    secondaryColor: branding?.secondaryColor ?? null,
    accentColor: branding?.accentColor ?? null,
    fontFamily: branding?.fontFamily ?? null,
    welcomeMessage: branding?.welcomeMessage ?? venue.guestWelcomeMessage ?? null,
  };
}
