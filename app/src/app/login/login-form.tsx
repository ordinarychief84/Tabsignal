"use client";

import Link from "next/link";
import { useState } from "react";

type Status = "idle" | "submitting" | "error" | "verify-needed";

/**
 * Password-only sign-in form for StaffMember rows.
 *
 * The signup flow now collects a password upfront and gates first
 * login on a one-tap email verification link. After that link is
 * clicked, the only way in is email + password. Magic-link login
 * is no longer a UI option — keeps the form clean and the auth
 * model unambiguous.
 *
 * If the account hasn't verified its email yet, /api/auth/login
 * returns 401 EMAIL_UNVERIFIED. The form shows a "resend
 * verification link" call to action that POSTs /api/auth/start.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verifyResent, setVerifyResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    if (!email.trim()) {
      setStatus("error");
      setError("Enter your email.");
      return;
    }
    if (!password) {
      setStatus("error");
      setError("Enter your password.");
      return;
    }
    setStatus("submitting");
    setError(null);

    try {
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
        setError("Email or password didn't match.");
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
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  async function resendVerification() {
    if (verifyResent) return;
    try {
      await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    } catch {
      // The /auth/start endpoint always returns 200 to avoid leaking
      // whether the email is registered; nothing to do on error.
    }
    setVerifyResent(true);
  }

  /* ----------------- email-verification-needed view ---------------- */

  if (status === "verify-needed") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl bg-coral-soft/50 p-5">
          <p className="text-base font-semibold text-slate">Verify your email first</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            Your password is right — but the email on{" "}
            <span className="font-mono text-xs">{email}</span> hasn&rsquo;t been
            verified yet. We&rsquo;ll send a fresh one-tap link.
          </p>
        </div>
        {verifyResent ? (
          <p className="rounded-xl bg-chartreuse/20 p-4 text-[14px] text-slate">
            Verification link sent. Check your inbox.
          </p>
        ) : (
          <button
            type="button"
            onClick={resendVerification}
            className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft hover:-translate-y-0.5 hover:shadow-lift"
          >
            Send verification link
          </button>
        )}
      </div>
    );
  }

  /* ----------------------------- form ------------------------------ */

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="login-email" className="block text-[12px] font-medium text-slate/70">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@your-restaurant.com"
          className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
        />
      </div>

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

      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "submitting" || !email.trim() || !password}
        className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "submitting" ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-[12px] text-slate/55">
        New here?{" "}
        <Link href="/signup" className="text-umber underline-offset-4 hover:underline">
          Create a restaurant account
        </Link>
      </p>
    </form>
  );
}
