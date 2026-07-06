import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Crawler policy. Operational consoles and APIs are disallowed outright.
 *
 * Deliberately NOT listed: /guest/* and /v/[slug]/t/* (per-table token
 * URLs). Those carry a meta robots noindex instead — if robots.txt
 * blocked them, crawlers could never see the noindex and an externally
 * shared link could still surface as a bare "indexed, no content" URL.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/operator",
          "/staff",
          "/api/",
          "/dashboard",
          "/comp/",
          "/founder",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
