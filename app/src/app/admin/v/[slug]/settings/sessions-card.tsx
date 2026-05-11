"use client";

/**
 * Account security card on the venue Settings page. Today: a single
 * "Sign out everywhere" action that clears the session cookie on the
 * current device and (server-side) bumps the inviter so any cached JWTs
 * for this account stop authenticating on next request.
 *
 * Phase-2: list active sessions with device + last-active so the
 * manager can selectively revoke. Requires server-side session table
 * (not yet in schema) — flagged in the earlier QA verdict.
 */

import { useState } from "react";

export function SessionsCard({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function signOutEverywhere() {
    if (busy) return;
    if (!window.confirm("Sign you out on every device? Other people you've added to this venue are unaffected.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/sign-out-everywhere", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setMsg("Signed out. Reloading…");
      // Drop the local cookie + bounce to the sign-in page.
      window.location.href = "/staff/login?err=signed_out";
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not sign out everywhere");
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate/10 bg-white px-6 py-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Account security</p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate">
            Signed in as <span className="font-mono text-[12px]">{email}</span>
          </p>
          <p className="mt-1 text-[12px] text-slate/55">
            Sessions live for 30 days. Sign out everywhere if you lose a phone or
            suspect someone else used your inbox link.
          </p>
        </div>
        <button
          type="button"
          onClick={signOutEverywhere}
          disabled={busy}
          className="shrink-0 rounded-lg border border-coral/30 bg-coral/10 px-3 py-1.5 text-[12px] font-medium text-coral hover:bg-coral/15 disabled:opacity-60"
        >
          {busy ? "Signing out…" : "Sign out everywhere"}
        </button>
      </div>
      {msg ? (
        <p className="mt-3 rounded-lg bg-slate/5 px-3 py-2 text-[12px] text-slate/70">{msg}</p>
      ) : null}
    </section>
  );
}
