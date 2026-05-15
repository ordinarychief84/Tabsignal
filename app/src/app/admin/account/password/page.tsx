import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin-auth";
import { ChangePasswordForm } from "./change-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · Change password" };

/**
 * Lets a signed-in super admin rotate their password.
 *
 * Auth: requires an active admin session (getAdminSession). Non-admins
 * land here → redirected to /admin/login with a `next` back to here.
 *
 * After a successful change, the API clears the admin cookie and the
 * form redirects to /admin/login. The new password must be used to
 * sign back in. This invalidates every other session that admin holds.
 */
export default async function ChangePasswordPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login?next=/admin/account/password");
  }

  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <header className="px-6 pt-8">
        <Link href="/operator" className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          <span>TabCall</span>
          <span className="text-slate/40">·</span>
          <span>Operator</span>
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-card ring-1 ring-umber-soft/30">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Super admin</p>
          <h1 className="mt-2 text-3xl font-medium leading-tight text-slate">Change password</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/65">
            Signed in as <span className="font-mono text-slate">{session.email}</span>.
            Saving will sign you out of every device — you&rsquo;ll come back to{" "}
            <code className="font-mono text-[12px]">/admin/login</code> with the new password.
          </p>

          <div className="mt-6">
            <ChangePasswordForm />
          </div>

          <p className="mt-6 text-center text-[11px] text-slate/45">
            Forgot your current password?{" "}
            <a href="mailto:hello@tab-call.com" className="text-umber underline-offset-4 hover:underline">
              Contact ops
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
