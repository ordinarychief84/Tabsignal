"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Venue = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  zipCode: string | null;
  timezone: string;
  stripeAttached: boolean;
  stripeReady: boolean;
  requestsEnabled: boolean;
  preorderEnabled: boolean;
  reservationsEnabled: boolean;
  createdAt: string;
  org: { id: string; name: string; plan: string; subscriptionStatus: string };
  counts: { staff: number; tables: number; sessions: number; requests: number };
};

const PLANS = ["STARTER", "FLAT", "FOUNDING"] as const;
const PLAN_LABEL: Record<string, string> = {
  FOUNDING: "Founding",
  STARTER: "Starter",
  FLAT: "Flat",
};

export function VenuesPanel() {
  const [items, setItems] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<string>("");
  const [hasStripe, setHasStripe] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (plan) params.set("plan", plan);
      if (hasStripe) params.set("hasStripe", hasStripe);
      const res = await fetch(`/api/operator/venues?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setItems(body.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load venues");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function toggleKill(v: Venue, field: "requestsEnabled" | "preorderEnabled" | "reservationsEnabled", value: boolean) {
    setBusy(v.id);
    setError(null);
    const prev = items;
    setItems(items.map(x => x.id === v.id ? { ...x, [field]: value } : x));
    try {
      const res = await fetch(`/api/operator/venues/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  async function suspendVenue(v: Venue) {
    if (!window.confirm(`Suspend ${v.name}? All three kill switches will be turned off.`)) return;
    setBusy(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/operator/venues/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestsEnabled: false, preorderEnabled: false, reservationsEnabled: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not suspend");
    } finally {
      setBusy(null);
    }
  }

  async function deleteVenue(v: Venue) {
    if (!window.confirm(`PERMANENTLY DELETE ${v.name}? Wipes ${v.counts.tables} tables, ${v.counts.sessions} sessions, ${v.counts.requests} requests, every staff row, and the venue itself. This is NOT reversible.`)) return;
    if (window.prompt(`Type "${v.slug}" to confirm`) !== v.slug) return;
    setBusy(v.id);
    setError(null);
    try {
      const res = await fetch(`/api/operator/venues/${v.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setItems(items.filter(x => x.id !== v.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Founder</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Venues</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Every venue platform-wide. Inline kill switches, click into the venue
          for full admin, suspend / delete from the ⋯ menu.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate/10 bg-white p-4">
        <form onSubmit={e => { e.preventDefault(); void load(); }} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            type="text" placeholder="Search by name or slug…" value={q}
            onChange={e => setQ(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <select value={plan} onChange={e => setPlan(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm">
            <option value="">All plans</option>
            {PLANS.map(p => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}
          </select>
          <select value={hasStripe} onChange={e => setHasStripe(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm">
            <option value="">Any Stripe</option>
            <option value="true">Stripe attached</option>
            <option value="false">No Stripe</option>
          </select>
          <button type="submit" className="rounded-xl bg-slate px-5 py-2.5 text-sm text-oat hover:bg-slate/90">
            Filter
          </button>
        </form>
      </section>

      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-2.5 text-sm text-coral">{error}</p>
      ) : null}

      <p className="mb-3 text-[11px] tracking-wide text-slate/40">{loading ? "Loading…" : `${items.length} venue${items.length === 1 ? "" : "s"}`}</p>

      {!loading && items.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No venues match those filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(v => (
            <li key={v.id} className="rounded-2xl border border-slate/10 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/v/${v.slug}`} className="text-sm font-medium text-slate hover:underline">
                      {v.name}
                    </Link>
                    <Pill tone="umber">{PLAN_LABEL[v.org.plan] ?? v.org.plan}</Pill>
                    {v.stripeReady ? <Pill tone="chartreuse">STRIPE LIVE</Pill>
                      : v.stripeAttached ? <Pill tone="coral">STRIPE INCOMPLETE</Pill>
                      : <Pill tone="slate">NO STRIPE</Pill>}
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate/55">
                    /{v.slug} · {v.org.name} · created {rel(v.createdAt)}
                  </p>
                  <p className="mt-2 text-[12px] text-slate/55">
                    {v.counts.staff} staff · {v.counts.tables} tables · {v.counts.sessions} sessions · {v.counts.requests} requests
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <Link href={`/admin/v/${v.slug}`} className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate">
                    Open admin →
                  </Link>
                  <Link href={`/operator/orgs/${v.org.id}`} className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate">
                    Org →
                  </Link>
                  <button type="button" disabled={busy === v.id} onClick={() => suspendVenue(v)}
                    className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate disabled:opacity-60">
                    Suspend
                  </button>
                  <button type="button" disabled={busy === v.id} onClick={() => deleteVenue(v)}
                    className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-1.5 text-[11px] font-medium text-coral hover:bg-coral/15 disabled:opacity-60">
                    Delete
                  </button>
                </div>
              </div>
              {/* Kill switches */}
              <div className="flex flex-wrap items-center gap-3 border-t border-slate/5 px-5 py-2.5 text-[12px] text-slate/65">
                <KillToggle label="Requests"     on={v.requestsEnabled}     onChange={val => toggleKill(v, "requestsEnabled", val)} />
                <KillToggle label="Pre-order"    on={v.preorderEnabled}    onChange={val => toggleKill(v, "preorderEnabled", val)} />
                <KillToggle label="Reservations" on={v.reservationsEnabled} onChange={val => toggleKill(v, "reservationsEnabled", val)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function KillToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (val: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} className="accent-chartreuse" />
      <span>{label}</span>
      <span className={on ? "text-sea" : "text-coral"}>{on ? "on" : "off"}</span>
    </label>
  );
}

function Pill({ tone, children }: { tone: "chartreuse" | "coral" | "umber" | "slate"; children: React.ReactNode }) {
  const cls = {
    chartreuse: "bg-chartreuse/40 text-slate",
    coral:      "bg-coral/15 text-coral",
    umber:      "bg-umber/20 text-slate",
    slate:      "bg-slate/10 text-slate/60",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{children}</span>;
}

function rel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
