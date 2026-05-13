import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-auth";
import { AdminLoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · Super-admin sign-in" };

/**
 * Password sign-in for TabCall super admins (PlatformAdmin rows).
 *
 * This is distinct from /staff/login (which is magic-link auth for
 * StaffMember rows). A super admin who tries to access /admin/login
 * while already signed in is bounced straight to /operator.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: { err?: string; next?: string };
}) {
  // Already signed in? Skip the form, go to the operator console.
  const existing = await getAdminSession();
  if (existing) {
    redirect(searchParams.next?.startsWith("/") ? searchParams.next : "/operator");
  }

  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <header className="px-6 pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          TabCall
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-card ring-1 ring-umber-soft/30">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Super admin</p>
          <h1 className="mt-2 text-3xl font-medium leading-tight text-slate">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/65">
            Password sign-in for the TabCall platform admin console. Regular
            staff sign in at{" "}
            <Link href="/staff/login" className="text-umber underline-offset-4 hover:underline">
              /staff/login
            </Link>{" "}
            by magic link.
          </p>

          <div className="mt-6">
            <AdminLoginForm nextUrl={searchParams.next} />
          </div>
        </div>
      </div>
    </main>
  );
}
