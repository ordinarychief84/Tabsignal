"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Org = {
  id: string;
  name: string;
  plan: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string;
  subscriptionPriceId: string | null;
  subscriptionPeriodEnd: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  venueCount: number;
  memberCount: number;
  venues: { id: string; slug: string; name: string }[];
};

// Plan enum on Organization. Subscription-tier labels (Growth, Pro)
// live separately under planById() and are sent to the billing flip
// endpoint as { planId: "growth" | "pro" }.
const PLANS = ["STARTER", "FLAT", "FOUNDING"] as const;
const FLIP_TIERS = ["free", "growth", "pro"] as const;
const FLIP_LABEL: Record<string, string> = { free: "Starter (free)", growth: "Growth", pro: "Pro" };
const STATUSES = ["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"] as const;

const PLAN_TONE: Record<string, string> = {
  FOUNDING: "bg-umber/20 text-slate",
  STARTER:  "bg-slate/10 text-slate/70",
  FLAT:     "bg-sea/30 text-slate",
};

const STATUS_TONE: Record<string, string> = {
  NONE:     "bg-slate/10 text-slate/55",
  TRIALING: "bg-sea/30 text-slate",
  ACTIVE:   "bg-chartreuse/40 text-slate",
  PAST_DUE: "bg-coral/20 text-coral",
  CANCELED: "bg-coral/15 text-coral",
};

export function OrgsPanel() {
  const [items, setItems] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (plan) params.set("plan", plan);
      if (status) params.set("status", status);
      const res = await fetch(`/api/operator/orgs?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setItems(body.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orgs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function flipPlan(o: Org, newTier: string) {
    if (!window.confirm(`Flip ${o.name} → ${FLIP_LABEL[newTier]}? Doesn't charge via Stripe — just updates DB state.`)) return;
    setBusy(o.id);
    setError(null);
    try {
      const res = await fetch(`/api/operator/orgs/${o.id}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: newTier }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not flip plan");
    } finally {
      setBusy(null);
    }
  }

  async function deleteOrg(o: Org) {
    if (!window.confirm(`PERMANENTLY DELETE ${o.name}? This wipes ${o.venueCount} venue${o.venueCount === 1 ? "" : "s"} + every staff / table / session / request / audit row underneath. NOT reversible.`)) return;
    if (window.prompt(`Type "${o.name}" to confirm`) !== o.name) return;
    setBusy(o.id);
    setError(null);
    try {
      const res = await fetch(`/api/operator/orgs/${o.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setItems(items.filter(x => x.id !== o.id));
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
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Organizations</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Every org platform-wide. Inline plan flip, click into the org for
          members + broadcast, delete from the danger menu.
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate/10 bg-white p-4">
        <form onSubmit={e => { e.preventDefault(); void load(); }} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <input type="text" placeholder="Search org name…" value={q}
            onChange={e => setQ(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea" />
          <select value={plan} onChange={e => setPlan(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm">
            <option value="">All plans</option>
            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-sm">
            <option value="">All sub statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="rounded-xl bg-slate px-5 py-2.5 text-sm text-oat hover:bg-slate/90">
            Filter
          </button>
        </form>
      </section>

      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-2.5 text-sm text-coral">{error}</p>
      ) : null}

      <p className="mb-3 text-[11px] tracking-wide text-slate/40">{loading ? "Loading…" : `${items.length} org${items.length === 1 ? "" : "s"}`}</p>

      {!loading && items.length === 0 ? (
        <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No orgs match those filters.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(o => (
            <li key={o.id} className="rounded-2xl border border-slate/10 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/operator/orgs/${o.id}`} className="text-sm font-medium text-slate hover:underline">
                      {o.name}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PLAN_TONE[o.plan] ?? "bg-slate/10 text-slate/55"}`}>{o.plan}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_TONE[o.subscriptionStatus] ?? "bg-slate/10 text-slate/55"}`}>{o.subscriptionStatus}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-slate/55">
                    {o.venueCount} venue{o.venueCount === 1 ? "" : "s"} · {o.memberCount} member{o.memberCount === 1 ? "" : "s"} · created {rel(o.createdAt)}
                  </p>
                  {o.venues.length > 0 ? (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate/50">
                      <span className="text-slate/40">Venues:</span>
                      {o.venues.map(v => (
                        <Link key={v.id} href={`/admin/v/${v.slug}`} className="rounded-full bg-sea/30 px-2 py-0.5 text-slate/80 hover:underline">
                          {v.name}
                        </Link>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <select
                    defaultValue=""
                    disabled={busy === o.id}
                    onChange={e => { if (e.target.value) flipPlan(o, e.target.value); }}
                    className="rounded-lg border border-slate/15 bg-white px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-slate/30"
                    aria-label={`Flip plan for ${o.name}`}
                  >
                    <option value="">Flip plan…</option>
                    {FLIP_TIERS.map(t => <option key={t} value={t}>{FLIP_LABEL[t]}</option>)}
                  </select>
                  <Link href={`/operator/orgs/${o.id}`} className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate">
                    Open →
                  </Link>
                  <Link href={`/operator/orgs/${o.id}/broadcast`} className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate">
                    Broadcast
                  </Link>
                  <button type="button" disabled={busy === o.id} onClick={() => deleteOrg(o)}
                    className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-1.5 text-[11px] font-medium text-coral hover:bg-coral/15 disabled:opacity-60">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
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
