import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db";

/**
 * Everything a guest sees lives under here.
 *
 * The root layout applies a `%s | TabCall` template over a marketing
 * default, which meant any guest page without its own title showed
 * TabCall's SEO copy in the browser tab, in history, and in the preview
 * card when someone shares the link. A guest came to a restaurant; the
 * name on the tab should be the restaurant's.
 *
 * Set at this level rather than deeper so the venue-scoped not-found and
 * error boundaries inherit it too — those are exactly the moments a guest
 * is most likely to look at the tab and wonder where they are.
 *
 * Pages with their own metadata (the public venue page, menu, waitlist,
 * waitlist) still override this, which is right: they are indexable
 * marketing surfaces for the venue and want fuller titles.
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const venue = await db.venue
    .findUnique({ where: { slug: params.slug }, select: { name: true } })
    .catch(() => null);

  // `absolute` is load-bearing: without it the site-wide template appends
  // "| TabCall" and we're back where we started.
  return { title: { absolute: venue?.name ?? "Your table" } };
}

export default function VenueScopedLayout({ children }: { children: ReactNode }) {
  return children;
}
