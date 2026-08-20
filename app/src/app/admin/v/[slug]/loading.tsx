import { PageSkeleton } from "@/components/admin/ui";

/**
 * Shown while any venue-dashboard page renders on the server.
 *
 * The shell (sidebar, venue name, plan badge) lives in layout.tsx and
 * stays mounted, so only the content area swaps — one file covers all
 * ~24 pages under this route.
 */
export default function Loading() {
  return <PageSkeleton />;
}
