import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * /dashboard — spec-friendly alias.
 *
 * TabCall's actual dashboard lives at /admin/v/[slug] because we
 * support multi-venue orgs. New restaurant owners often try
 * /dashboard out of muscle memory from other SaaS tools, so this
 * route does the lookup-and-redirect for them.
 *
 * Behavior:
 *   - No session → /staff/login?next=/dashboard
 *   - Session + venue resolved → /admin/v/<slug>
 *   - Session but venue lookup failed (deleted? race?) → /staff/login
 *     with an error param so we surface what happened rather than
 *     looping
 */
export default async function DashboardAliasPage() {
  const session = await getStaffSession();
  if (!session) {
    redirect("/staff/login?next=/dashboard");
  }

  const venue = await db.venue.findUnique({
    where: { id: session.venueId },
    select: { slug: true },
  });
  if (!venue?.slug) {
    // Edge case: the session's venueId no longer resolves (e.g. venue
    // was deleted by an operator). Push to staff/login with a hint so
    // the user knows what happened.
    redirect("/staff/login?err=venue-missing");
  }

  redirect(`/admin/v/${venue.slug}`);
}
