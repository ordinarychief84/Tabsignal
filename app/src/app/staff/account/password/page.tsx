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
 * Two flows, dispatched on the server based on whether the row already
 * has a passwordHash:
 *  - first-time setup: just a new + confirm field
 *  - rotation:        current + new + confirm
 *
 * After a successful change the API bumps sessionsValidAfter, so the
 * caller's session is invalidated and they're sent to /login to sign in
 * fresh.
 */
export default async function StaffChangePasswordPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login?next=/staff/account/password");

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!staff) redirect("/login");

  const hasPassword = Boolean(staff.passwordHash);

  return (
    <main className="flex min-h-screen flex-col bg-surface-warm text-slate">
      <header className="px-5 pt-6 sm:px-8">
        <Link href="/staff" className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
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
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Account</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
            {hasPassword ? "Change password" : "Set a password"}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate/65">
            Signed in as <span className="font-mono text-xs">{staff.email}</span>.{" "}
            {hasPassword
              ? "Saving will sign you out everywhere — you'll come back to /login with the new password."
              : "Adds a password so you can sign in without waiting for the magic-link email. You can still use the magic link anytime."}
          </p>

          <div className="mt-6">
            <StaffChangePasswordForm hasPassword={hasPassword} />
          </div>
        </div>
      </div>
    </main>
  );
}
