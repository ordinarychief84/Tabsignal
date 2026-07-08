import Link from "next/link";

/**
 * "Continue with Google" — a plain link to the OAuth start route (a GET
 * that 302s to Google). Server components render it only when
 * oauthGoogleEnabled() is true, so no client JS and no flash of a
 * dead button when the feature is unconfigured.
 */
export function GoogleSignInButton({
  intent,
  next,
}: {
  intent: "login" | "signup";
  next?: string;
}) {
  const params = new URLSearchParams({ intent });
  if (next) params.set("next", next);
  const href = `/api/auth/google/start?${params.toString()}`;
  return (
    <a
      href={href}
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/30 hover:bg-slate/[0.02]"
    >
      <GoogleG />
      Continue with Google
    </a>
  );
}

/** Divider — "or" between OAuth and email/password. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-slate/10" />
      <span className="text-[11px] uppercase tracking-[0.16em] text-slate/40">{label}</span>
      <span className="h-px flex-1 bg-slate/10" />
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
