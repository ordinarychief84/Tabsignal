"use client";

import { useEffect, useState } from "react";

type Admin = {
  id: string;
  email: string;
  name: string | null;
  notes: string | null;
  source: "env" | "db";
  suspended: boolean;
  suspendedAt: string | null;
  suspendedBy: { email: string; name: string | null } | null;
  addedAt: string | null;
  addedBy: { email: string; name: string | null } | null;
  lastSeenAt: string | null;
  isYou: boolean;
};

export function AdminsPanel({ selfEmail }: { selfEmail: string }) {
  const [items, setItems] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // invite form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/admins");
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setItems(body.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admins");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/operator/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, notes: notes || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setEmail(""); setName(""); setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add admin");
    } finally {
      setAdding(false);
    }
  }

  async function setSuspended(a: Admin, suspended: boolean) {
    if (a.source === "env") return;
    setBusy(a.id);
    setError(null);
    try {
      const res = await fetch(`/api/operator/admins/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update admin");
    } finally {
      setBusy(null);
    }
  }

  async function remove(a: Admin) {
    if (a.source === "env") return;
    if (!window.confirm(`Remove ${a.email}? This wipes the admin row but keeps no audit copy. (Suspend if you might want them back.)`)) return;
    setBusy(a.id);
    setError(null);
    try {
      const res = await fetch(`/api/operator/admins/${a.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove admin");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Founder</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Platform admins</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          The TabCall internal staff allowlist. Two sources: emails in the
          <code className="mx-1 rounded bg-slate/5 px-1 text-[12px]">OPERATOR_EMAILS</code> Vercel env
          (read-only here, change requires a redeploy) and DB-backed
          PlatformAdmin rows you can add/suspend/remove from this page.
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-slate/10 bg-white p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Add a new admin</p>
        <p className="mt-1 text-sm text-slate/55">
          Stored in DB. Effective immediately — no redeploy. The new
          admin signs in via <code>/staff/login</code> with this email.
        </p>
        <form onSubmit={addAdmin} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            type="email" required placeholder="email@tab-call.com" value={email}
            onChange={e => setEmail(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <input
            type="text" placeholder="Name (optional)" value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <input
            type="text" placeholder="Notes (e.g. role / hire date)" value={notes}
            onChange={e => setNotes(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <button
            type="submit" disabled={adding}
            className="rounded-xl bg-chartreuse px-5 py-3 text-sm font-medium text-slate disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add admin"}
          </button>
        </form>
      </section>

      {error ? (
        <p role="alert" className="mb-4 rounded-2xl border border-coral/30 bg-coral/10 px-4 py-2.5 text-sm text-coral">{error}</p>
      ) : null}

      <section>
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium">All admins</h2>
          <p className="text-[11px] tracking-wide text-slate/40">{loading ? "Loading…" : `${items.length} total`}</p>
        </header>

        {items.length === 0 && !loading ? (
          <div className="rounded-2xl border border-coral/20 bg-coral/5 px-6 py-10 text-center text-sm text-coral">
            ⚠ No admins. Add one above or set <code>OPERATOR_EMAILS</code> in Vercel — without an admin, <code>/operator</code> denies everyone.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map(a => (
              <li key={a.id} className={`rounded-2xl border bg-white px-5 py-4 ${a.suspended ? "border-coral/20 opacity-70" : "border-slate/10"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-[13px] font-medium text-slate">{a.email}</p>
                      {a.isYou ? <Pill tone="chartreuse">YOU</Pill> : null}
                      <Pill tone={a.source === "env" ? "umber" : "sea"}>{a.source.toUpperCase()}</Pill>
                      {a.suspended ? <Pill tone="coral">SUSPENDED</Pill> : <Pill tone="chartreuse-light">ACTIVE</Pill>}
                    </div>
                    {(a.name || a.notes) ? (
                      <p className="mt-1 text-[12px] text-slate/55">
                        {a.name ?? ""}{a.name && a.notes ? " · " : ""}{a.notes ?? ""}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate/45">
                      {a.source === "env"
                        ? "Set in OPERATOR_EMAILS env. Edit in Vercel + redeploy to change."
                        : <>
                            Added {a.addedAt ? rel(a.addedAt) : "—"}
                            {a.addedBy ? ` by ${a.addedBy.email}` : ""}
                            {a.suspended && a.suspendedAt ? ` · suspended ${rel(a.suspendedAt)}` : ""}
                            {a.suspendedBy ? ` by ${a.suspendedBy.email}` : ""}
                          </>
                      }
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {a.source === "db" && !a.isYou ? (
                      <>
                        <button
                          type="button" disabled={busy === a.id}
                          onClick={() => setSuspended(a, !a.suspended)}
                          className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate disabled:opacity-60"
                        >
                          {busy === a.id ? "…" : a.suspended ? "Reactivate" : "Suspend"}
                        </button>
                        <button
                          type="button" disabled={busy === a.id}
                          onClick={() => remove(a)}
                          className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-1.5 text-[11px] font-medium text-coral hover:bg-coral/15 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </>
                    ) : a.source === "env" ? (
                      <span className="text-[11px] text-slate/40">env-only</span>
                    ) : a.isYou ? (
                      <span className="text-[11px] text-slate/40">that&rsquo;s you</span>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Pill({ tone, children }: { tone: "chartreuse" | "chartreuse-light" | "coral" | "sea" | "umber"; children: React.ReactNode }) {
  const cls = {
    "chartreuse":       "bg-chartreuse/40 text-slate",
    "chartreuse-light": "bg-chartreuse/20 text-slate/80",
    "coral":            "bg-coral/15 text-coral",
    "sea":              "bg-sea/30 text-slate",
    "umber":            "bg-umber/20 text-slate",
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
