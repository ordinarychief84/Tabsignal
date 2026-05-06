import Link from "next/link";
import { SetupForm } from "./setup-form";

export const metadata = { title: "TabCall — venue setup" };

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-oat text-slate">
      <header className="border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#EEEFC8" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#EEEFC8" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight text-slate">TabCall</span>
          </Link>
          <p className="text-xs tracking-wide text-slate/50">Setup</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">New venue</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Set up your venue.</h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-slate/60">
          About three minutes. At the end you&rsquo;ll get a printable QR code for
          every table and a working live queue for your staff.
        </p>

        <div className="mt-10">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
