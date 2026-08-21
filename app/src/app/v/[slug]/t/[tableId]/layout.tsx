import type { Metadata } from "next";
import type { ReactNode } from "react";
import { db } from "@/lib/db";

/**
 * Table-scoped guest surface (welcome, home, feedback, picks, tab).
 *
 * Two jobs here, both about the guest belonging to the VENUE rather than
 * to us.
 *
 * Title. The root layout applies a `%s | TabCall` template over a
 * marketing default, so every page under here that didn't set its own
 * title put "QR Ordering, Waiter Calls & Live Service for Restaurants |
 * TabCall" in the guest's browser tab, history and share sheet. `absolute`
 * escapes the template so the tab just reads the venue's name — which is
 * the only name that means anything to someone sitting at table 12.
 *
 * Robots. Reachable only by scanning a physical QR, so it must never rank
 * — crawlable-but-noindex keeps accidentally shared links out of search.
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const venue = await db.venue
    .findUnique({ where: { slug: params.slug }, select: { name: true } })
    .catch(() => null);

  return {
    // `absolute` is load-bearing: without it the site-wide template
    // appends "| TabCall" and we're back where we started.
    title: { absolute: venue?.name ?? "Your table" },
    robots: { index: false, follow: false },
  };
}

export default function TableScopedLayout({ children }: { children: ReactNode }) {
  return children;
}
