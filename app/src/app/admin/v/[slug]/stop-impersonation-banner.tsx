"use client";

import { useState } from "react";

/**
 * Small coral banner shown at the top of every manager page while an
 * operator is impersonating. POSTs to /api/operator/impersonate/stop and
 * reloads — the API swaps the stashed cookie back into place and the
 * subsequent navigation lands them on /operator with their own identity.
 */
export function StopImpersonationBanner({ operatorEmail }: { operatorEmail: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStop() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/impersonate/stop", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Server clears cookies on failure too — bounce to login.
        window.location.href = "/staff/login";
        return;
      }
      window.location.href = body?.redirectTo ?? "/operator";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop impersonation");
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-coral/40 bg-coral/10 px-5 py-3 text-sm">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-coral">Impersonating</p>
        <p className="mt-1 truncate text-slate/80">
          Signed in as <span className="font-mono text-xs">{operatorEmail}</span> viewing this venue&rsquo;s dashboard.
        </p>
        {error ? <p className="mt-1 text-[11px] text-coral">{error}</p> : null}
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        className="shrink-0 rounded-full bg-slate px-4 py-1.5 text-xs font-medium text-oat hover:bg-slate/90 disabled:opacity-50"
      >
        {busy ? "Returning…" : "Stop impersonation →"}
      </button>
    </div>
  );
}
