import Link from "next/link";
import { PasswordSignIn } from "@/components/auth/password-sign-in";
import { oauthGoogleEnabled } from "@/lib/auth/oauth-google";
import { GoogleSignInButton, AuthDivider } from "../../google-signin-button";

export const metadata = { title: "TabCall · staff sign-in" };

/**
 * The sign-in screen every protected page redirects to.
 *
 * It used to email a one-tap link, which made it the odd one out: signup
 * collects a password, /login accepts one, and this page — the one a
 * server actually gets sent to when their session expires mid-shift —
 * could only tell them to go and check their email. Same form as /login
 * now, so the password you chose is the password that works everywhere.
 *
 * The `err` codes below still arrive from /api/auth/callback, which
 * handles the two link-shaped jobs that remain: confirming an email
 * address and accepting a staff invite. They are worded as link problems,
 * not sign-in problems, because that's what they are.
 */

const MESSAGES: Record<string, string> = {
  missing: "That link was missing its token. Sign in below, or ask your manager to send a fresh invite.",
  expired: "That link has expired. Sign in below, or ask your manager to send a fresh invite.",
  invalid: "That link isn't valid. Sign in below, or ask your manager to send a fresh invite.",
  already_used: "That link was already used — they only work once. Sign in below with your password.",
  suspended: "This account is suspended. Your manager can lift it.",
};

export default function StaffLogin({
  searchParams,
}: {
  searchParams: { err?: string; next?: string; changed?: string };
}) {
  const err = searchParams?.err;
  const errMsg = err && MESSAGES[err] ? MESSAGES[err] : null;
  // Only forward same-origin path-style values to the form.
  const nextUrl =
    searchParams?.next && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//")
      ? searchParams.next
      : undefined;

  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <header className="px-6 pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F4C95D" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F4C95D" />
            </svg>
          </span>
          TabCall
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-card ring-1 ring-umber-soft/30">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Staff</p>
          <h1 className="mt-2 text-3xl font-medium leading-tight text-slate">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/65">
            Your work email and the password you set.
          </p>

          {searchParams?.changed === "1" ? (
            <p
              role="status"
              className="mt-5 rounded-lg border border-chartreuse/40 bg-chartreuse/15 px-3 py-2 text-sm text-slate"
            >
              Password saved. Sign in with the new one.
            </p>
          ) : null}

          {errMsg ? (
            <p role="alert" className="mt-5 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {errMsg}
            </p>
          ) : null}

          <div className="mt-6">
            <PasswordSignIn nextUrl={nextUrl} />
          </div>

          {oauthGoogleEnabled() ? (
            <>
              <AuthDivider />
              <GoogleSignInButton intent="login" next={nextUrl} />
            </>
          ) : null}

          <p className="mt-6 text-[11px] leading-relaxed tracking-wide text-slate/45">
            No account yet? Your manager adds you from the venue&rsquo;s People
            page, and the invite email walks you through choosing a password.
          </p>
        </div>
      </div>
    </main>
  );
}
