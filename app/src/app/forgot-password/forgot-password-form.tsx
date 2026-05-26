"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

/**
 * Forgot-password form. Sends email to /api/auth/forgot-password.
 * Always shows the same success state regardless of whether the
 * email exists — the API endpoint deliberately returns 200 for both
 * cases to prevent enumeration. Rate-limit refusals (429) DO surface
 * separately so the user knows to wait.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus("error");
      setError("Enter your email.");
      return;
    }
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed.toLowerCase() }),
      });
      if (res.status === 429) {
        setStatus("error");
        setError("Too many attempts. Try again in an hour.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus("error");
        setError(body?.detail || body?.error || `HTTP ${res.status}`);
        return;
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (status === "sent") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl bg-chartreuse/20 p-5">
          <p className="text-base font-semibold text-slate">Check your email</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            If <span className="font-mono text-xs">{email}</span> is a TabCall account, a
            password-reset link is on its way. The link expires in 1 hour and can only be
            used once.
          </p>
        </div>
        <p className="text-center text-[12px] text-slate/55">
          Didn&rsquo;t get it? Check spam, then try again in a minute.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="forgot-email" className="block text-[12px] font-medium text-slate/70">
          Work email
        </label>
        <input
          id="forgot-email"
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
        {status === "submitting" ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
