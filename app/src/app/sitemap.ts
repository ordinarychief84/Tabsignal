import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { FEATURES } from "@/lib/features-data";
import { db } from "@/lib/db";

// Marketing routes are stable; venue microsites churn as venues launch.
// Regenerate daily.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const marketing: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/features`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...FEATURES.map(f => ({
      url: `${SITE_URL}/features/${f.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];

  // Live venue microsites (public menu + reservations) — local-SEO value
  // for the venues themselves. Only venues that finished onboarding.
  // DB unavailable (cold build, CI) → ship the marketing routes alone.
  let venuePages: MetadataRoute.Sitemap = [];
  try {
    const venues = await db.venue.findMany({
      where: { onboardingCompletedAt: { not: null } },
      select: { slug: true, createdAt: true },
      take: 5000,
      orderBy: { createdAt: "asc" },
    });
    venuePages = venues.flatMap(v => [
      { url: `${SITE_URL}/v/${v.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.4 },
      { url: `${SITE_URL}/v/${v.slug}/menu`, lastModified: now, changeFrequency: "daily" as const, priority: 0.5 },
      { url: `${SITE_URL}/v/${v.slug}/reservations`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.4 },
    ]);
  } catch {
    // Best-effort: a sitemap without venue pages is still a valid sitemap.
  }

  return [...marketing, ...venuePages];
}
