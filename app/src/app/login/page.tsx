import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "TabCall · Log in",
  description: "Sign in to your TabCall account by email.",
};

/**
 * Owner / staff log-in landing. Matches the /signup split-layout shell
 * so the auth pair feels coherent. Magic-link backend: enter email,
 * receive a single-use sign-in link.
 *
 * Operators with a PlatformAdmin password account sign in at
 * /admin/login instead.
 */
export default function LoginPage() {
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
          <Link href="/signup" className="text-[12px] text-slate/55 hover:text-slate sm:text-sm">
            New here?{" "}
            <span className="text-umber underline-offset-4 hover:underline">Create an account</span>
          </Link>
        </div>

        <div className="px-5 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8 lg:px-12 lg:pb-12 lg:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
            Welcome back
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-tight text-slate sm:text-[36px] lg:mt-5 lg:text-[48px]">
            Sign in to TabCall.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate/65 sm:text-base lg:mt-4">
            We&rsquo;ll email you a single-use sign-in link. No password to
            remember, no extra app to install.
          </p>

          <ul className="mt-8 hidden flex-col gap-3.5 lg:flex">
            <Bullet>Magic-link sign-in by email</Bullet>
            <Bullet>Single-use, expires in 15 minutes</Bullet>
            <Bullet>Same-device verification for safety</Bullet>
          </ul>
        </div>
      </aside>

      <section className="flex w-full items-start justify-center bg-surface-warm px-4 pb-12 pt-2 sm:px-6 sm:pb-16 lg:items-center lg:px-12 lg:pt-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
                Log in
              </h2>
              <p className="mt-2 text-[14px] text-slate/65 sm:text-[15px]">
                Enter your work email and we&rsquo;ll send a sign-in link.
              </p>
            </div>
            <LoginForm />
            <p className="mt-6 text-center text-[12px] text-slate/55">
              Don&rsquo;t have an account?{" "}
              <Link href="/signup" className="text-umber underline-offset-4 hover:underline">
                Create one
              </Link>
            </p>
          </div>
          <p className="mt-5 text-center text-[12px] text-slate/55">
            Are you a TabCall super admin?{" "}
            <Link href="/admin/login" className="text-umber underline-offset-4 hover:underline">
              Use password sign-in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-[15px] text-slate/75">
      <span
        aria-hidden
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-chartreuse text-slate"
      >
        <svg width="9" height="9" viewBox="0 0 12 12">
          <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </li>
  );
}
