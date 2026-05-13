"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "error";

export function AdminLoginForm({ nextUrl }: { nextUrl?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting" || !email || !password) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 401) {
        setStatus("error");
        setError("Invalid email or password.");
        return;
      }
      if (res.status === 429) {
        setStatus("error");
        setError("Too many attempts. Try again in an hour.");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setError(`Sign-in failed (HTTP ${res.status}).`);
        return;
      }
      const target = nextUrl?.startsWith("/") ? nextUrl : "/operator";
      window.location.href = target;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Network error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="admin-email" className="text-[11px] uppercase tracking-[0.18em] text-umber">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@tab-call.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-xl border border-umber-soft/40 bg-white px-4 py-3 text-base text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
        />
      </div>
      <div>
        <label
          htmlFor="admin-password"
          className="text-[11px] uppercase tracking-[0.18em] text-umber"
        >
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          required
          autoComplete="current-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-xl border border-umber-soft/40 bg-white px-4 py-3 text-base text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
        />
      </div>
      {error ? <p className="text-sm text-coral" role="alert">{error}</p> : null}
      <p className="text-[11px] leading-relaxed text-slate/55">
        Signing in confirms you accept TabCall&rsquo;s{" "}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-umber underline underline-offset-4">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/terms#privacy" target="_blank" rel="noopener noreferrer" className="text-umber underline underline-offset-4">
          Privacy Policy
        </a>
        .
      </p>
      <button
        type="submit"
        disabled={status === "submitting" || !email || !password}
        className="w-full rounded-xl bg-chartreuse py-3 text-base font-medium text-slate shadow-soft disabled:opacity-60"
      >
        {status === "submitting" ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
