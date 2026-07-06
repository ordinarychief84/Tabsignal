import type { Metadata } from "next";
import type { ReactNode } from "react";

// Table-scoped guest surface (request panel, bill, split, feedback,
// wishlist). Same posture as /guest/[qrToken]: reachable only by
// scanning a physical QR, so it must never rank — crawlable-but-noindex
// keeps accidentally shared links out of the index.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TableScopedLayout({ children }: { children: ReactNode }) {
  return children;
}
