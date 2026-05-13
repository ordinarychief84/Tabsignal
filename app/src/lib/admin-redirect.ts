import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

/**
 * Resolves the current staff session's venue slug and redirects to the
 * venue-scoped admin path. Used by the spec-verbatim flat /admin/* routes
 * (the user explicitly asked for parallel route shapes; this is the bridge
 * back to the deployed /admin/v/[slug]/* surface).
 *
 * The deployed routing is multi-tenant from day one — every venue has its
 * own slug and admin path. The flat routes can't actually live without a
 * venue context, so this helper just looks one up from the session.
 */
export async function redirectToVenueAdmin(subpath: string): Promise<never> {
  const session = await getStaffSession();
  if (!session) {
    redirect(`/staff/login?next=${encodeURIComponent("/admin" + (subpath ? "/" + subpath : ""))}`);
  }
  const venue = await db.venue.findUnique({
    where: { id: session.venueId },
    select: { slug: true },
  });
  if (!venue) {
    // Session points at a deleted venue — bounce to login to clear state.
    redirect("/staff/login?err=venue_missing");
  }
  const dest = `/admin/v/${venue.slug}` + (subpath ? `/${subpath}` : "");
  redirect(dest);
}
