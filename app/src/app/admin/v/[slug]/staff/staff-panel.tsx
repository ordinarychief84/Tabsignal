"use client";

import { useState } from "react";

type Table = { id: string; label: string; zone: string | null };

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  ackedCount: number;
  createdAt: string;
  tableIds: string[];
};

export function StaffPanel({
  initial,
  tables,
  currentEmail,
}: {
  initial: Member[];
  tables: Table[];
  currentEmail: string;
}) {
  const [items, setItems] = useState<Member[]>(initial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, send: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setItems(prev =>
        prev.some(p => p.id === body.id)
          ? prev.map(p => (p.id === body.id ? { ...p, ...body } : p))
          : [
              ...prev,
              {
                ...body,
                ackedCount: 0,
                createdAt: new Date().toISOString(),
                tableIds: [],
              },
            ]
      );
      if (body.devLink) setDevLink(body.devLink);
      setName("");
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(staffId: string, tableIds: string[]) {
    // Optimistic
    setItems(prev => prev.map(m => (m.id === staffId ? { ...m, tableIds } : m)));
    try {
      const res = await fetch(`/api/admin/staff/${staffId}/tables`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Roll back to whatever we previously had — simplest: refetch this row.
      const fresh = await fetch(`/api/admin/staff/${staffId}/tables`).then(r => r.json());
      setItems(prev =>
        prev.map(m =>
          m.id === staffId ? { ...m, tableIds: (fresh.tables ?? []).map((t: Table) => t.id) } : m
        )
      );
      setError(e instanceof Error ? e.message : "Could not save assignment");
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate/10 bg-white px-6 py-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Invite staff</p>
        <p className="mt-1 text-sm text-slate/55">
          They&rsquo;ll get a sign-in link by email. No passwords.
        </p>
        <form onSubmit={invite} className="mt-5 grid gap-3 sm:grid-cols-[1fr,1fr,auto]">
          <input
            type="text"
            required
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <input
            type="email"
            required
            inputMode="email"
            placeholder="email@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-chartreuse px-5 py-3 text-sm font-medium text-slate disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send link"}
          </button>
        </form>

        {error ? (
          <p className="mt-3 rounded-lg bg-coral/15 px-3 py-2 text-sm text-coral">{error}</p>
        ) : null}
        {devLink ? (
          <p className="mt-3 rounded-lg bg-chartreuse/15 px-3 py-2 text-[11px] text-slate/70">
            <span className="uppercase tracking-wider">Dev link:</span>{" "}
            <a className="break-all underline" href={devLink}>{devLink}</a>
          </p>
        ) : null}
      </section>

      <section>
        <header className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-medium">Team</h2>
          <p className="text-[11px] tracking-wide text-slate/40">
            {items.length} member{items.length === 1 ? "" : "s"} · {tables.length} table{tables.length === 1 ? "" : "s"}
          </p>
        </header>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
            No staff yet. Add yourself first to test the queue.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map(m => (
              <li
                key={m.id}
                className="rounded-2xl border border-slate/10 bg-white"
              >
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate">
                      {m.name}
                      {m.email === currentEmail ? (
                        <span className="ml-2 rounded-full bg-chartreuse/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate/70">
                          you
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[12px] text-slate/55">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono text-sm tabular-nums text-slate">{m.ackedCount}</p>
                      <p className="text-[10px] tracking-wide text-slate/40">acked</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                      className="rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
                    >
                      {editingId === m.id ? "Close" : "Tables"}
                    </button>
                  </div>
                </div>

                {/* Assigned-table chips (always visible) */}
                <div className="border-t border-slate/5 px-5 py-2.5">
                  {m.tableIds.length === 0 ? (
                    <p className="text-[11px] text-slate/40">
                      No tables assigned. Requests still surface in the live queue.
                    </p>
                  ) : (
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate/60">
                      <span className="text-slate/40">Covers:</span>
                      {tables
                        .filter(t => m.tableIds.includes(t.id))
                        .map(t => (
                          <span
                            key={t.id}
                            className="rounded-full bg-sea/30 px-2 py-0.5 text-[11px] text-slate/80"
                          >
                            {t.label}
                          </span>
                        ))}
                    </p>
                  )}
                </div>

                {/* Inline editor */}
                {editingId === m.id ? (
                  <div className="border-t border-slate/5 px-5 py-4">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
                      Assign tables to {m.name}
                    </p>
                    <p className="mt-1 text-[11px] text-slate/55">
                      Selections save automatically. Multiple staff can cover the same table.
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {tables.map(t => {
                        const active = m.tableIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              const next = active
                                ? m.tableIds.filter(id => id !== t.id)
                                : [...m.tableIds, t.id];
                              saveAssignment(m.id, next);
                            }}
                            className={[
                              "rounded-lg border px-2 py-2 text-[12px] transition-colors",
                              active
                                ? "border-slate bg-slate text-oat"
                                : "border-slate/15 bg-white text-slate/70 hover:border-slate/30",
                            ].join(" ")}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => saveAssignment(m.id, tables.map(t => t.id))}
                        className="text-[11px] text-umber underline-offset-4 hover:underline"
                      >
                        Assign all
                      </button>
                      <button
                        type="button"
                        onClick={() => saveAssignment(m.id, [])}
                        className="text-[11px] text-umber underline-offset-4 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
