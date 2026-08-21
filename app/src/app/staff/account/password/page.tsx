import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { StaffChangePasswordForm } from "./change-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · Set password" };

/**
 * Set / rotate the StaffMember password.
 *
 * Two flows, dispatched on the server from whether the row already has a
 * passwordHash:
 *  - first-time setup: just a new + confirm field
 *  - rotation:        current + new + confirm
 *
 * The first-time flow is no longer an optional extra buried in account
 * settings. It is the last step of accepting a staff invite: the callback
 * sends a password-less account here before anywhere else, because a link
 * is how you accept an invite, not how you sign in from then on. `next`
 * carries where they were originally headed so the step feels like part
 * of arriving rather than a detour.
 *
 * Rotation still bumps sessionsValidAfter and lands back at sign-in;
 * first-time setup keeps the session, since there is no old password to
 * cut off.
 */
export default async function StaffChangePasswordPage({
  searchParams,
}: {
  searchParams: { first?: string; next?: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect("/login?next=/staff/account/password");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!staff) redirect("/login");

  const hasPassword = Boolean(staff.passwordHash);
  // Same-origin paths only — this value ends up in a client-side
  // navigation after the save.
  const nextUrl =
    searchParams?.next && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//")
      ? searchParams.next
      : "/staff";
  // The invite/verification link sets first=1. Belt and braces: an
  // account that already has a password is never on a first run, whatever
  // the query string claims.
  const firstRun = !hasPassword && searchParams?.first === "1";

  return (
    <main className="flex min-h-screen flex-col bg-surface-warm text-slate">
      <header className="px-5 pt-6 sm:px-8">
        <Link href={firstRun ? "/" : "/staff"} className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          TabCall
          <span aria-hidden className="text-slate/30">·</span>
          <span>Account</span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-card ring-1 ring-slate/10 sm:p-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {firstRun ? "One last step" : "Account"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
            {hasPassword ? "Change password" : firstRun ? "Choose a password" : "Set a password"}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate/65">
            {firstRun ? (
              <>
                This is how you&rsquo;ll sign in from now on — that invite link
                only works once. Twelve characters or more, for{" "}
                <span className="font-mono text-xs">{staff.email}</span>.
              </>
            ) : hasPassword ? (
              <>
                Signed in as <span className="font-mono text-xs">{staff.email}</span>.
                Saving signs you out everywhere else, then brings you back here
                to sign in with the new one.
              </>
            ) : (
              <>
                Signed in as <span className="font-mono text-xs">{staff.email}</span>.
                A password is how you sign in — set one and you won&rsquo;t need
                an email to get back on the floor.
              </>
            )}
          </p>

          <div className="mt-6">
            <StaffChangePasswordForm hasPassword={hasPassword} nextUrl={nextUrl} firstRun={firstRun} />
          </div>
        </div>
      </div>
    </main>
  );
}
