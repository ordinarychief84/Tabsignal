"use client";

import { useState } from "react";

export function ImpersonateButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    if (!confirm(`Impersonate ${slug}? Your operator session will be replaced. To stop, sign out and sign back in.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      window.location.href = body.redirectTo ?? `/admin/v/${slug}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={busy}
        className="text-umber underline-offset-4 hover:underline disabled:opacity-50"
        title="Replace your session with a venue-staff session for support purposes. Audit-logged."
      >
        {busy ? "…" : "impersonate"}
      </button>
      {error ? <span className="ml-2 text-coral">{error}</span> : null}
    </>
  );
}
