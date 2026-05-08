"use client";

import { useEffect, useState } from "react";

type Share = {
  id: string;
  staffMemberId: string;
  staffName: string;
  shareWeight: number;
  payoutCents: number;
  paidOutAt: string | null;
};

type Pool = {
  id: string;
  period: string;
  startedAt: string;
  endedAt: string | null;
  closedAt: string | null;
  totalTipsCents: number;
  shares: Share[];
};

type Staff = { id: string; name: string };

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TipsPanel({ slug, staff }: { slug: string; staff: Staff[] }) {
  const [pools, setPools] = useState<Pool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [draftWeights, setDraftWeights] = useState<Record<string, Record<string, number>>>({});

  async function load() {
    try {
      const res = await fetch(`/api/admin/v/${slug}/tip-pools`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setPools(body.pools);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => { load(); }, []);

  async function startPool() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tip-pools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "SHIFT" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setWorking(false);
    }
  }

  async function saveShares(poolId: string) {
    setWorking(true);
    setError(null);
    const weights = draftWeights[poolId] ?? {};
    const shares = Object.entries(weights)
      .filter(([, w]) => w > 0)
      .map(([staffMemberId, shareWeight]) => ({ staffMemberId, shareWeight }));
    try {
      const res = await fetch(`/api/admin/v/${slug}/tip-pools/${poolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setWorking(false);
    }
  }

  async function closePool(poolId: string) {
    if (!confirm("Close pool and compute payouts?")) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tip-pools/${poolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ close: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setWorking(false);
    }
  }

  function setWeight(poolId: string, staffId: string, weight: number) {
    setDraftWeights(prev => ({
      ...prev,
      [poolId]: { ...(prev[poolId] ?? {}), [staffId]: weight },
    }));
  }

  function getWeight(pool: Pool, staffId: string): number {
    if (draftWeights[pool.id]?.[staffId] !== undefined) {
      return draftWeights[pool.id][staffId];
    }
    return pool.shares.find(s => s.staffMemberId === staffId)?.shareWeight ?? 0;
  }

  const open = pools.find(p => !p.closedAt);
  const closed = pools.filter(p => p.closedAt);

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">{error}</p>
      ) : null}

      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">Open pool</h2>
        {open ? (
          <article className="rounded-2xl border border-slate/10 bg-white p-5">
            <header className="flex items-baseline justify-between">
              <div>
                <p className="text-base font-medium">Started {new Date(open.startedAt).toLocaleString()}</p>
                <p className="text-xs text-slate/50">{open.period.toLowerCase()} pool</p>
              </div>
              <button
                onClick={() => closePool(open.id)}
                disabled={working}
                className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
              >
                Close pool · compute payouts
              </button>
            </header>
            <div className="mt-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Who&rsquo;s working (set weight)</p>
              <ul className="mt-2 divide-y divide-slate/5">
                {staff.map(s => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span className="text-sm">{s.name}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={getWeight(open, s.id)}
                      onChange={e => setWeight(open.id, s.id, Number(e.target.value) || 0)}
                      className="w-20 rounded border border-slate/15 px-2 py-1 text-right text-sm"
                    />
                  </li>
                ))}
              </ul>
              <button
                onClick={() => saveShares(open.id)}
                disabled={working}
                className="mt-3 rounded-full border border-slate/15 px-4 py-1.5 text-sm hover:border-slate/40 disabled:opacity-50"
              >
                Save weights
              </button>
            </div>
          </article>
        ) : (
          <button
            onClick={startPool}
            disabled={working}
            className="rounded-full bg-slate px-4 py-2 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
          >
            + Start a new pool
          </button>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[11px] uppercase tracking-[0.16em] text-umber">Closed pools</h2>
        {closed.length === 0 ? (
          <p className="rounded-lg border border-slate/10 bg-white px-5 py-4 text-sm text-slate/50">No closed pools yet.</p>
        ) : (
          <div className="space-y-3">
            {closed.map(p => (
              <article key={p.id} className="rounded-2xl border border-slate/10 bg-white p-5">
                <header className="flex items-baseline justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {new Date(p.startedAt).toLocaleDateString()} · {dollars(p.totalTipsCents)} pooled
                    </p>
                    <p className="text-xs text-slate/50">
                      Closed {p.closedAt ? new Date(p.closedAt).toLocaleString() : "—"}
                    </p>
                  </div>
                </header>
                <ul className="mt-3 divide-y divide-slate/5">
                  {p.shares.map(s => (
                    <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {s.staffName}
                        <span className="ml-2 text-xs text-slate/40">×{s.shareWeight}</span>
                      </span>
                      <span className="font-mono text-xs">{dollars(s.payoutCents)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
