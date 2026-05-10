import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "TabCall — staff sign-in" };

const MESSAGES: Record<string, string> = {
  missing: "That link is missing its token. Request a new one below.",
  expired: "That sign-in link has expired. Request a new one.",
  invalid: "That sign-in link is invalid. Request a new one.",
  already_used: "That sign-in link was already used. Request a fresh one — they're single-use for security.",
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
    <main className="flex min-h-screen flex-col bg-slate text-oat">
      <header className="px-6 pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-oat/70 hover:text-oat">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#C9F61C" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16" r="2" fill="#C9F61C" />
          </svg>
          TabCall
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-oat/40">Staff</p>
          <h1 className="mt-2 text-3xl font-medium leading-tight">Sign in</h1>
          <p className="mt-3 text-sm leading-relaxed text-oat/70">
            Enter your work email. We&rsquo;ll send a one-tap sign-in link that
            opens this app.
          </p>
          {errMsg ? (
            <p className="mt-5 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
              {errMsg}
            </p>
          ) : null}
          <div className="mt-6">
            <LoginForm nextUrl={nextUrl} />
          </div>
          <p className="mt-6 text-[11px] tracking-wide text-oat/30">
            If your manager hasn&rsquo;t added you yet, ask them.
          </p>
        </div>
      </div>
    </main>
  );
}
