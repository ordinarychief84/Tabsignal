import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata = { title: "TabCall · start free" };

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-oat text-slate">
      <header className="border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#C9F61C" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#C9F61C" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight">TabCall</span>
          </Link>
          <p className="text-xs tracking-wide text-slate/50">
            Already have a venue?{" "}
            <Link href="/staff/login" className="text-umber underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Start free</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Live on your bar tonight.</h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-slate/65">
          One email, one venue, one magic-link sign-in. On the next screen
          you&rsquo;ll bulk-create tables, generate printable QR sheets, and
          finish Stripe Connect onboarding. About three minutes total.
        </p>

        <ul className="mt-6 space-y-1.5 text-sm text-slate/65">
          <li>· Starter is free for up to 5 tables. No card needed to start.</li>
          <li>· Live request queue + AI review intercept from minute one.</li>
          <li>· Growth or Pro? Start the 14-day free trial after signup, pay nothing for 14 days, cancel anytime.</li>
          <li>· If TabCall isn&rsquo;t earning its keep, cancel by text.</li>
        </ul>

        <div className="mt-10">
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
