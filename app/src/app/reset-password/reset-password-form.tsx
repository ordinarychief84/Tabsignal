"use client";

import Link from "next/link";
import { useState } from "react";

type Status = "idle" | "submitting" | "done" | "error" | "no-token";

/**
 * Reset-password form. POSTs to /api/auth/reset-password with the
 * token from the URL + the user's new password. On success, redirects
 * to /login with a success banner — the user has to sign in with the
 * new password (any session they had on this device is now invalid
 * because /api/auth/reset-password bumps sessionsValidAfter).
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>(token ? "idle" : "no-token");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    if (password.length < 12) {
      setStatus("error");
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setError("Passwords don't match.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setStatus("error");
        setError("Too many attempts. Try again in an hour.");
        return;
      }
      if (res.status === 400 && body?.error === "INVALID_OR_EXPIRED_TOKEN") {
        setStatus("error");
        setError(
          "This link doesn't work anymore — it may have expired or already been used. Request a new one from the forgot-password page.",
        );
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setError(body?.detail || body?.error || `HTTP ${res.status}`);
        return;
      }
      setStatus("done");
      // Short delay so the success banner is visible before navigation.
      setTimeout(() => {
        window.location.href = "/login?reset=ok";
      }, 1200);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  if (status === "no-token") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl bg-coral/15 p-5">
          <p className="text-base font-semibold text-slate">Missing token</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            This page needs the token from your password-reset email. Start the flow from{" "}
            <Link href="/forgot-password" className="text-umber underline-offset-4 hover:underline">
              forgot-password
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="rounded-2xl bg-chartreuse/20 p-5">
          <p className="text-base font-semibold text-slate">Password updated</p>
          <p className="mt-2 text-[14px] leading-relaxed text-slate/75">
            Redirecting you to sign in with your new password…
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="reset-password-new" className="block text-[12px] font-medium text-slate/70">
          New password
        </label>
        <div className="relative mt-1.5">
          <input
            id="reset-password-new"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
            className="block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 pr-16 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 inline-flex h-9 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-[12px] font-medium text-slate/55 hover:bg-slate/[0.04] hover:text-slate"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="reset-password-confirm" className="block text-[12px] font-medium text-slate/70">
          Confirm password
        </label>
        <input
          id="reset-password-confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Retype your new password"
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
        disabled={status === "submitting" || password.length < 12 || password !== confirm}
        className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "submitting" ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
