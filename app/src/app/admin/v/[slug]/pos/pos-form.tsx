"use client";

/**
 * Provider picker + credentials text-area. Calls the PATCH endpoint and
 * reloads the page on success so the server-rendered cards re-render with
 * fresh status. We intentionally avoid managing the integration row in
 * client state — the server is the source of truth and a page refresh
 * keeps the audit/log section in sync.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

type Provider = "NONE" | "TOAST" | "SQUARE" | "CLOVER";
type Status = "PENDING" | "CONNECTED" | "DISCONNECTED" | "ERROR";

type Props = {
  slug: string;
  initialProvider: Provider;
  initialStatus: Status;
  // Whether the row already has credentials stored. We never show the
  // value — just a hint that something is saved.
  hasCredentials: boolean;
};

const PROVIDERS: { value: Provider; label: string; hint: string }[] = [
  { value: "NONE", label: "No POS", hint: "Run orders and bills inside TabCall only." },
  { value: "TOAST", label: "Toast", hint: "Sync menu + push orders to Toast." },
  { value: "SQUARE", label: "Square", hint: "Sync menu + push orders to Square." },
  { value: "CLOVER", label: "Clover", hint: "Sync menu + push orders to Clover." },
];

const STATUSES: { value: Status; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "CONNECTED", label: "Connected" },
  { value: "DISCONNECTED", label: "Disconnected" },
  { value: "ERROR", label: "Error" },
];

export function PosForm({ slug, initialProvider, initialStatus, hasCredentials }: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [credentialsText, setCredentialsText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    let credentials: Record<string, unknown> | undefined;
    if (credentialsText.trim().length > 0) {
      try {
        const parsed = JSON.parse(credentialsText);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Credentials must be a JSON object.");
        }
        credentials = parsed as Record<string, unknown>;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid JSON.");
        setPending(false);
        return;
      }
    }

    try {
      const res = await fetch(`/api/admin/v/${slug}/pos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          status,
          ...(credentials ? { credentials } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setCredentialsText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-[11px] uppercase tracking-[0.18em] text-umber">Provider</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map(p => {
            const active = provider === p.value;
            return (
              <label
                key={p.value}
                className={[
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                  active
                    ? "border-slate bg-slate/5"
                    : "border-slate/10 bg-white hover:border-slate/20",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.value}
                  checked={active}
                  onChange={() => setProvider(p.value)}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-slate/55">{p.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[11px] uppercase tracking-[0.18em] text-umber">Status</legend>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as Status)}
          className="w-full rounded-xl border border-slate/15 bg-white px-3 py-2 text-sm text-slate focus:border-slate focus:outline-none"
        >
          {STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate/55">
          Set once you&rsquo;ve verified the integration. Toggle to <span className="font-medium">Disconnected</span> to
          pause sync without losing credentials.
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[11px] uppercase tracking-[0.18em] text-umber">Credentials (JSON)</legend>
        <textarea
          value={credentialsText}
          onChange={e => setCredentialsText(e.target.value)}
          placeholder={
            hasCredentials
              ? "Credentials saved. Paste a new JSON object to rotate."
              : '{"accessToken": "...", "restaurantId": "..."}'
          }
          rows={5}
          className="w-full rounded-xl border border-slate/15 bg-white px-3 py-2 font-mono text-xs text-slate focus:border-slate focus:outline-none"
        />
        <p className="text-xs text-slate/55">
          Encrypted at rest with AES-256-GCM. Plaintext is never returned by the API.{" "}
          {hasCredentials ? <span className="text-umber">Credentials stored.</span> : null}
        </p>
      </fieldset>

      {error ? (
        <p className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">{error}</p>
      ) : null}
      {saved ? (
        <p className="rounded-lg border border-chartreuse/40 bg-chartreuse/15 px-3 py-2 text-xs text-slate">
          Saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate px-4 py-2 text-sm font-medium text-oat hover:bg-slate/90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save POS settings"}
      </button>
    </form>
  );
}
