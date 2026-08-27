import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · your profile" };

/**
 * What a guest sees when they sit at your table.
 *
 * Its own page rather than a panel on the console: this is set once at
 * the start of a job and then left alone, and putting it on the screen a
 * server stares at during service would be paying rent for something
 * used twice a year.
 */
export default async function StaffProfilePage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/staff/profile");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: {
      name: true,
      displayName: true,
      photoUrl: true,
      welcomeMessage: true,
      section: true,
      role: true,
      venue: { select: { name: true, guestWelcomeMessage: true } },
    },
  });
  if (!staff) redirect("/staff/login?err=invalid");

  return (
    <main className="min-h-[100dvh] bg-ivory text-plum">
      <header className="border-b border-sandstone bg-ivory/90 px-4 py-3 backdrop-blur lg:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-graphite">
              {staff.venue.name}
            </p>
            <h1 className="mt-0.5 text-[20px] font-semibold leading-tight tracking-tight text-plum">
              Your profile
            </h1>
          </div>
          <Link
            href="/staff"
            className="shrink-0 rounded-xl border border-sandstone px-3.5 py-2.5 text-[13px] font-medium text-plum hover:bg-surface-hover"
          >
            Back
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 py-5 lg:px-6">
        <ProfileForm
          initial={{
            name: staff.name,
            displayName: staff.displayName,
            photoUrl: staff.photoUrl,
            welcomeMessage: staff.welcomeMessage,
            section: staff.section,
            role: staff.role,
            venueName: staff.venue.name,
            venueWelcomeMessage: staff.venue.guestWelcomeMessage,
          }}
        />
      </div>
    </main>
  );
}
