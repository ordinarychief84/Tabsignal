"use client";

import Link from "next/link";
import { useState } from "react";

type Mode = "password" | "magic-link";
type Status = "idle" | "submitting" | "sent" | "error" | "verify-needed";

/**
 * Hybrid sign-in form for StaffMember.
 *
 * Two modes:
 *  - password: email + password → POST /api/auth/login mints a session
 *  - magic-link: email only → POST /api/auth/start emails a sign-in link
 *
 * The user can toggle. Default is password (faster, matches SaaS habits).
 * For accounts that haven't set a password, the password attempt returns
 * INVALID_CREDENTIALS — the form's "Send me a sign-in link instead"
 * fallback button is always visible so the user is never stranded.
 */
export function LoginForm() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    if (mode === "password" && !password) {
      setStatus("error");
      setError("Enter your password, or switch to a sign-in link.");
      return;
    }
    setStatus("submitting");
    setError(null);

    try {
      if (mode === "password") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.status === 401 && body?.error === "EMAIL_UNVERIFIED") {
          setStatus("verify-needed");
          return;
        }
        if (res.status === 401) {
          setStatus("error");
          setError("Email or password didn't match. If you've never set a password, send yourself a sign-in link.");
          return;
        }
        if (res.status === 429) {
          setStatus("error");
          setError("Too many attempts. Try again in an hour.");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          setError(body?.detail || body?.error || `HTTP ${res.status}`);
          return;
        }
        window.location.href = "/staff";
        return;
      }
      // magic-link mode
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
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  async function resendVerification() {
    try {
      await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // Silent — magic-link is a 200-regardless endpoint anyway.
    }
    setStatus("sent");
  }

  /* ----------------- success / verification states ----------------- */

  if (status === "verify-needed") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl bg-coral-soft/50 p-5">
          <p className="text-base font-semibold text-slate">Verify your email first</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            Your password is right — but the email on{" "}
            <span className="font-mono text-xs">{email}</span> hasn&rsquo;t been
            verified yet. We&rsquo;ll send a one-tap link.
          </p>
        </div>
        <button
          type="button"
          onClick={resendVerification}
          className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
        >
          Send verification link
        </button>
      </div>
    );
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

  /* ----------------------------- form ------------------------------ */

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

      {mode === "password" ? (
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="login-password" className="block text-[12px] font-medium text-slate/70">
              Password
            </label>
            <Link href="/forgot-password" className="text-[11px] text-umber underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1.5">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={1}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 pr-12 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate/55 hover:bg-slate/[0.04] hover:text-slate"
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7c2.21 0 4.2.7 5.83 1.74" />
                  <path d="M22 12s-3.5 7-10 7c-2.21 0-4.2-.7-5.83-1.74" />
                  <path d="M3 3l18 18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting" || !email.trim() || (mode === "password" && !password)}
        className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "submitting"
          ? mode === "password"
            ? "Signing in…"
            : "Sending link…"
          : mode === "password"
          ? "Sign in"
          : "Email me a sign-in link"}
      </button>

      <div className="relative my-2 text-center">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-slate/10" />
        <span className="relative inline-block bg-white px-3 text-[11px] uppercase tracking-[0.16em] text-slate/45">
          or
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "password" ? "magic-link" : "password");
          setError(null);
        }}
        className="min-h-[44px] w-full rounded-xl border border-slate/15 bg-white text-[14px] font-medium text-slate hover:border-slate/30"
      >
        {mode === "password" ? "Send me a sign-in link instead" : "Use password instead"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-slate/55">
        {mode === "password"
          ? "First time here? Use the sign-in link option to verify your email."
          : "Single-use, expires in 15 minutes. Open on the same device."}
      </p>
    </form>
  );
}
