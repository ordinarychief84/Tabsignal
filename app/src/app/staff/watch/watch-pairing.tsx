"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Watch pairing panel: generate a 6-digit code (10-min TTL, single-use),
 * show it big enough to read at arm's length while typing on a watch,
 * and list/revoke previously paired devices.
 */

type Device = {
  id: string;
  name: string;
  platform: string;
  pushEnabled: boolean;
  lastSeenAt: string | null;
  pairedAt: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  wearos: "Wear OS",
  watchos: "Apple Watch",
  tizen: "Samsung",
  fitbit: "Fitbit",
  other: "Watch",
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function WatchPairing() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/wear/devices", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setDevices(body.devices ?? []);
    } catch { /* transient — list stays as-is */ }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  // Countdown for the active code; refresh the device list when it hits
  // zero so a successful pairing shows up without a manual reload.
  useEffect(() => {
    if (expiresAt === null) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setCode(null);
        setExpiresAt(null);
        void loadDevices();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, loadDevices]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wear/pair", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setCode(body.code);
      const ends = new Date(body.expiresAt).getTime();
      setExpiresAt(ends);
      setSecondsLeft(Math.max(0, Math.floor((ends - Date.now()) / 1000)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a code.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(d: Device) {
    if (!window.confirm(`Unpair "${d.name}"? The watch stops receiving requests immediately.`)) return;
    setError(null);
    const prev = devices;
    setDevices((devices ?? []).filter(x => x.id !== d.id));
    try {
      const res = await fetch(`/api/wear/devices/${d.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setDevices(prev);
      setError(e instanceof Error ? e.message : "Couldn't unpair.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate/10 bg-white px-6 py-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Pair a smartwatch</p>
        {code ? (
          <>
            <p
              className="mt-4 font-mono text-5xl font-semibold tracking-[0.3em] text-slate"
              aria-live="polite"
            >
              {code}
            </p>
            <p className="mt-3 text-sm text-slate/60">
              Open the TabCall app on your watch and enter this code.
            </p>
            <p className="mt-1 text-xs text-slate/45">
              Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} · single-use ·
              replaces any earlier code
            </p>
            <button
              type="button"
              onClick={() => void loadDevices()}
              className="mt-4 text-xs text-umber underline-offset-4 hover:underline"
            >
              Paired it? Refresh the list below
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate/60">
              Get guest requests on your wrist — buzz on new signals, &ldquo;Got it&rdquo; without
              touching your phone.
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="mt-5 rounded-xl bg-chartreuse px-6 py-3 text-sm font-semibold text-slate disabled:opacity-60"
            >
              {busy ? "Creating code…" : "Show pairing code"}
            </button>
          </>
        )}
      </section>

      {error ? (
        <p className="rounded-xl border border-coral/40 bg-coral/10 px-4 py-2.5 text-sm text-coral" role="alert">
          {error}
        </p>
      ) : null}

      <section>
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-medium text-slate">Paired watches</h2>
          <p className="text-[11px] text-slate/40">
            {devices ? `${devices.length} device${devices.length === 1 ? "" : "s"}` : "…"}
          </p>
        </header>
        {devices && devices.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-5 py-6 text-center text-sm text-slate/55">
            No watches paired yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {(devices ?? []).map(d => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate/10 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate">
                    {d.name}
                    <span className="ml-2 rounded-full bg-slate/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate/60">
                      {PLATFORM_LABEL[d.platform] ?? d.platform}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate/50">
                    Last seen {relative(d.lastSeenAt)} · {d.pushEnabled ? "push on" : "push off"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void revoke(d)}
                  className="shrink-0 rounded-lg border border-coral/30 px-3 py-1.5 text-[11px] font-medium text-coral hover:bg-coral/10"
                >
                  Unpair
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-[11px] leading-relaxed text-slate/45">
        Watch apps are built on the TabCall Wear SDK (<code className="font-mono">sdk/tabcall-wear</code>).
        Unpair a lost watch here — it cuts off instantly.
      </p>
    </div>
  );
}
