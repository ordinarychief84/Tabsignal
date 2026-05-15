import Link from "next/link";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "TabCall · Create your account",
  description:
    "Run smarter hospitality operations. Live on your floor tonight. No credit card required.",
};

/**
 * Split-layout signup page. Left panel is a soft hospitality scene with
 * product positioning + feature bullets + social proof. Right panel is
 * the form card. On mobile the left panel collapses to a tight header
 * and the form takes the full width.
 *
 * Backend remains the existing magic-link signup (POST /api/signup).
 * Password and OAuth buttons in the form mirror the SaaS-spec visual
 * but route through the same magic-link flow — see PR commit notes for
 * the password-auth follow-up scope.
 */
export default function SignupPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-surface-warm lg:grid-cols-[1.05fr_1fr]">
      {/* LEFT: hospitality scene + positioning. Collapses to a slim header
          on mobile so the form is above the fold. */}
      <aside className="relative isolate overflow-hidden bg-surface-warm lg:bg-transparent">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              // Sage radial top-right + warm butter wash bottom-left so the
              // panel reads as a daylit restaurant, not a marketing splash.
              "radial-gradient(60% 50% at 85% 15%, rgba(199, 214, 207, 0.55) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(50% 50% at 5% 90%, rgba(242, 231, 183, 0.45) 0%, rgba(247, 245, 242, 0) 65%)",
          }}
        />

        {/* TabCall mark sticks to the top — present on mobile too so the
            brand never disappears. */}
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
          <Link
            href="/login"
            className="text-[12px] text-slate/55 transition-colors hover:text-slate sm:text-sm"
          >
            Have an account?{" "}
            <span className="text-umber underline-offset-4 hover:underline">Log in</span>
          </Link>
        </div>

        {/* Mobile: keep the headline + bullets short so the form reaches
            above the fold. Desktop: full positioning. */}
        <div className="px-5 pb-8 pt-6 sm:px-8 sm:pb-10 sm:pt-8 lg:px-12 lg:pb-12 lg:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
            For hospitality operators
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-tight text-slate sm:text-[36px] lg:mt-5 lg:text-[48px]">
            Run smarter hospitality operations.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-slate/65 sm:text-base lg:mt-4">
            TabCall helps restaurants, bars, cafés, and lounges streamline
            service, payments, and guest experience.
          </p>

          {/* Feature bullets — visible on desktop; condensed on mobile */}
          <ul className="mt-7 grid grid-cols-2 gap-x-3 gap-y-2 sm:max-w-md lg:mt-10 lg:flex lg:flex-col lg:gap-3.5">
            <BulletItem>QR ordering</BulletItem>
            <BulletItem>Table payments</BulletItem>
            <BulletItem>Call waiter</BulletItem>
            <BulletItem>POS integrations</BulletItem>
            <BulletItem className="col-span-2 lg:col-span-1">Reviews &amp; analytics</BulletItem>
          </ul>

          {/* Social-proof strip. Subtle on mobile so the form has room. */}
          <div className="mt-8 hidden lg:mt-16 lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-umber">
              Trusted by modern hospitality teams
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3 text-slate/55">
              <span className="text-base font-bold italic">Luna Lounge</span>
              <span className="text-base font-bold tracking-wider">URBAN BISTRO</span>
              <span className="text-base font-bold lowercase">harbor eats</span>
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT: form card */}
      <section className="flex w-full items-start justify-center bg-surface-warm px-4 pb-12 pt-2 sm:px-6 sm:pb-16 lg:items-center lg:px-12 lg:pt-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-slate/10 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-slate sm:text-3xl">
                Create your TabCall account
              </h2>
              <p className="mt-2 text-[14px] text-slate/65 sm:text-[15px]">
                Get started in minutes. No setup fees.
              </p>
            </div>
            <SignupForm />
            <p className="mt-6 text-center text-[12px] text-slate/55">
              Already have an account?{" "}
              <Link href="/login" className="text-umber underline-offset-4 hover:underline">
                Log in
              </Link>
            </p>
          </div>

          <p className="mt-5 flex items-center justify-center gap-2 text-[12px] text-slate/55">
            <span
              aria-hidden
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sea-soft text-slate"
            >
              <svg width="9" height="9" viewBox="0 0 12 12">
                <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            No credit card required
          </p>
        </div>
      </section>
    </main>
  );
}

function BulletItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <li className={["flex items-center gap-2 text-[14px] text-slate/75 sm:text-[15px]", className ?? ""].join(" ")}>
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
