"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

/**
 * Magic-link log-in form. Posts to /api/auth/start which silently 200s
 * regardless of whether the email is registered (no enumeration).
 *
 * In dev (`TABSIGNAL_DEV_LINKS=true` or `NODE_ENV=development`) the
 * response carries a `devLink` for local testing.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    if (!email.trim()) {
      setStatus("error");
      setError("Enter your email.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      if (body?.devLink) setDevLink(body.devLink);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send link");
    }
  }

  if (status === "sent") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl bg-chartreuse/20 p-5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-chartreuse text-slate">
              <svg width="14" height="14" viewBox="0 0 12 12">
                <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-base font-semibold text-slate">Check your email</p>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            If <span className="font-mono text-xs">{email}</span> is registered,
            we&rsquo;ve sent a sign-in link. Tap it from this device.
          </p>
        </div>
        {devLink ? (
          <p className="break-all rounded bg-slate/5 px-3 py-2 text-[11px] text-slate/55">
            <span className="uppercase tracking-wider">Dev:</span>{" "}
            <a className="underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="block text-[12px] font-medium text-slate/70">
          Work email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@your-venue.com"
          className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
        />
      </div>
      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting" || !email.trim()}
        className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "submitting" ? "Sending link…" : "Email me a sign-in link"}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-slate/55">
        Single-use, expires in 15 minutes. Open the link on the same device
        you submitted from.
      </p>
    </form>
  );
}
