import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator } from "@/lib/auth/operator";
import { SetupForm } from "./setup-form";

export const metadata = { title: "TabCall — venue setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await getStaffSession();
  const operator = isOperator(session);

  if (!operator) {
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
            <p className="text-xs tracking-wide text-slate/50">Concierge setup</p>
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Talk to us</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight">We onboard every venue ourselves.</h1>
          <p className="mt-3 text-base leading-relaxed text-slate/65">
            For the first hundred venues, we do setup with you on a 15-minute
            call — pick the right plan, configure Stripe Connect, print your
            tents, hand you a phone for the bar. No self-serve form yet.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <a
              href="mailto:hello@tabcall.app?subject=TabCall%20setup"
              className="rounded-lg bg-chartreuse px-5 py-3 text-sm font-medium text-slate"
            >
              Email hello@tabcall.app
            </a>
            <Link href="/" className="text-sm text-umber underline-offset-4 hover:underline">
              ← back to TabCall
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
