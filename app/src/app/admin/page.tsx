import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/admin");

  const venue = await db.venue.findFirst({
    where: { id: session.venueId },
    select: { slug: true },
  });
  if (!venue) redirect("/admin/setup");
  redirect(`/admin/v/${venue.slug}`);
}
