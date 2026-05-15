import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "../login/login-form";

export const metadata: Metadata = {
  title: "TabCall · Forgot password",
  description: "Email-based password recovery for TabCall.",
};

/**
 * Forgot-password landing. Because TabCall uses passwordless sign-in,
 * there's no password to reset — a sign-in link IS the recovery. We
 * surface this explicitly here so users coming from another SaaS habit
 * understand. Form is the same /api/auth/start magic-link flow used by
 * /login.
 *
 * The super-admin /admin/login flow does have a real password and a
 * separate change-password page at /admin/account/password.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-surface-warm lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate overflow-hidden bg-surface-warm lg:bg-transparent">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 85% 15%, rgba(199, 214, 207, 0.55) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(50% 50% at 5% 90%, rgba(242, 231, 183, 0.45) 0%, rgba(247, 245, 242, 0) 65%)",
          }}
        />

        <div className="flex items-center justify-between px-5 pt-6 sm:px-8 lg:px-12 lg:pt-10">
          <Link href="/" aria-label="TabCall home" className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate">TabCall</span>
          </Link>
          <Link href="/login" className="text-[12px] text-slate/55 hover:text-slate sm:text-sm">
            <span className="text-umber underline-offset-4 hover:underline">← back to sign-in</span>
          </Link>
        </div>

        <div className="px-5 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8 lg:px-12 lg:pb-12 lg:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
            Account recovery
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-tight text-slate sm:text-[36px] lg:mt-5 lg:text-[48px]">
            No password to forget.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate/65 sm:text-base lg:mt-4">
            TabCall uses passwordless sign-in. Enter your email and
            we&rsquo;ll send a single-use link that signs you in.
          </p>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-slate/55">
            Same flow as /login — we kept this URL so you land somewhere
            sensible if you bookmarked the old SaaS habit.
          </p>
        </div>
      </aside>

      <section className="flex w-full items-start justify-center bg-surface-warm px-4 pb-12 pt-2 sm:px-6 sm:pb-16 lg:items-center lg:px-12 lg:pt-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
                Send me a sign-in link
              </h2>
              <p className="mt-2 text-[14px] text-slate/65 sm:text-[15px]">
                Enter the email associated with your TabCall account.
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
