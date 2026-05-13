import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "TabCall · staff sign-in" };

const MESSAGES: Record<string, string> = {
  missing: "That link is missing its token. Request a new one below.",
  expired: "That sign-in link has expired. Request a new one.",
  invalid: "That sign-in link is invalid. Request a new one.",
  already_used: "That sign-in link was already used. Request a fresh one. They're single-use for security.",
};

export default function StaffLogin({
  searchParams,
}: {
  searchParams: { err?: string; sent?: string; next?: string };
}) {
  const err = searchParams?.err;
  const errMsg = err && MESSAGES[err] ? MESSAGES[err] : null;
  // Only forward same-origin path-style values to the form.
  const nextUrl = searchParams?.next && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//")
    ? searchParams.next
    : undefined;

  return (
    <main className="flex min-h-screen flex-col bg-oat text-slate">
      <header className="px-6 pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate/70 hover:text-slate">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate">
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          TabCall
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-card ring-1 ring-umber-soft/30">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Staff</p>
          <h1 className="mt-2 text-3xl font-medium leading-tight text-slate">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/65">
            Enter your work email. We&rsquo;ll send a one-tap sign-in link that
            opens this app.
          </p>
          {errMsg ? (
            <p className="mt-5 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {errMsg}
            </p>
          ) : null}
          <div className="mt-6">
            <LoginForm nextUrl={nextUrl} />
          </div>
          <p className="mt-6 text-[11px] tracking-wide text-slate/45">
            If your manager hasn&rsquo;t added you yet, ask them.
          </p>
        </div>
      </div>
    </main>
  );
}
