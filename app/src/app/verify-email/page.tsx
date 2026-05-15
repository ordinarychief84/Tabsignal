import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TabCall · Verify your email",
  description: "How TabCall verifies your email via the magic-link sign-in.",
};

/**
 * Email-verification explainer.
 *
 * Magic-link sign-in IS the email verification — clicking the link
 * from the user's inbox proves ownership of the address. This page
 * exists so users with a SaaS habit of typing "/verify-email" land
 * somewhere sensible.
 *
 * Real callback handling for verification lives at /api/auth/callback.
 */
export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { state?: "waiting" | "success" | "expired" };
}) {
  const state = searchParams.state ?? "waiting";

  return (
    <main className="flex min-h-screen flex-col bg-surface-warm text-slate">
      <header className="px-5 pt-6 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          TabCall
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-card ring-1 ring-slate/10 sm:p-9">
          {state === "success" ? <Success /> : state === "expired" ? <Expired /> : <Waiting />}
        </div>
      </div>
    </main>
  );
}

function Waiting() {
  return (
    <>
      <span
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sea-soft text-slate"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v16H4z" />
          <path d="M4 8l8 6 8-6" />
        </svg>
      </span>
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate">Check your email</h1>
      <p className="mt-3 text-center text-[14px] leading-relaxed text-slate/65">
        We send a single-use sign-in link to your inbox. Tap it from this
        device and you&rsquo;re in — that&rsquo;s also how we verify
        you own the address.
      </p>
      <p className="mt-4 rounded-xl bg-slate/[0.03] p-3 text-[12px] leading-relaxed text-slate/65">
        Didn&rsquo;t get one yet? Head back to{" "}
        <Link href="/login" className="text-umber underline-offset-4 hover:underline">
          /login
        </Link>{" "}
        and request a new link.
      </p>
    </>
  );
}

function Success() {
  return (
    <>
      <span
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-chartreuse text-slate"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5 9-11" />
        </svg>
      </span>
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate">You&rsquo;re in.</h1>
      <p className="mt-3 text-center text-[14px] leading-relaxed text-slate/65">
        Your email is verified. We&rsquo;re taking you to your dashboard.
      </p>
      <Link
        href="/staff"
        className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
      >
        Open dashboard
      </Link>
    </>
  );
}

function Expired() {
  return (
    <>
      <span
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-coral-soft text-coral"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16h.01" />
        </svg>
      </span>
      <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight text-slate">Link expired</h1>
      <p className="mt-3 text-center text-[14px] leading-relaxed text-slate/65">
        Sign-in links are single-use and valid for 15 minutes. We can
        send a fresh one in a few seconds.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
      >
        Request a new link
      </Link>
    </>
  );
}
