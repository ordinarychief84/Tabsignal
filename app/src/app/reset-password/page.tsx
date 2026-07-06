import Link from "next/link";
import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your TabCall account.",
  robots: { index: false, follow: false },
};

/**
 * /reset-password?token=... — destination of the link in the
 * password-reset email. Reads `?token` and hands it to the form,
 * which POSTs to /api/auth/reset-password with the user's new
 * password. On success the user is redirected to /login (they have
 * to sign in with the new password — we deliberately don't auto-mint
 * a session here so the user proves they remember the password they
 * just set, and so any other-device sessions are clearly invalidated).
 */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";

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
        </div>

        <div className="px-5 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8 lg:px-12 lg:pb-12 lg:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
            Account recovery
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-tight text-slate sm:text-[36px] lg:mt-5 lg:text-[48px]">
            Choose a new password.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate/65 sm:text-base lg:mt-4">
            Pick something at least 12 characters. Once you save, every device that was
            previously signed in will be signed out automatically.
          </p>
        </div>
      </aside>

      <section className="flex w-full items-start justify-center bg-surface-warm px-4 pb-12 pt-2 sm:px-6 sm:pb-16 lg:items-center lg:px-12 lg:pt-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
                New password
              </h2>
              <p className="mt-2 text-[14px] text-slate/65 sm:text-[15px]">
                12 characters minimum.
              </p>
            </div>
            <ResetPasswordForm token={token} />
          </div>
          <p className="mt-5 text-center text-[12px] text-slate/55">
            Already remembered it?{" "}
            <Link href="/login" className="text-umber underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
