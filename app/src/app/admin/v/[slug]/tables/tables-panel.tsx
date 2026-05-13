"use client";

import { useState } from "react";

type TableRow = {
  id: string;
  label: string;
  zone: string | null;
  sessionCount: number;
  requestCount: number;
  preOrderCount: number;
};

export function TablesPanel({ slug, initial }: { slug: string; initial: TableRow[] }) {
  const [tables, setTables] = useState<TableRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addOne(label: string, zone: string | null) {
    setPending("add");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, zone: zone ?? undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setTables(curr => [...curr, {
        id: body.id, label: body.label, zone: zone,
        sessionCount: 0, requestCount: 0, preOrderCount: 0,
      }].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function addBulk(count: number, zone: string | null) {
    setPending("bulk");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, zone: zone ?? undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      const created: Array<{ id: string; label: string }> = body.created ?? [];
      setTables(curr => [
        ...curr,
        ...created.map(c => ({ id: c.id, label: c.label, zone, sessionCount: 0, requestCount: 0, preOrderCount: 0 })),
      ].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
      setBulkOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function rename(id: string, nextLabel: string) {
    const before = tables;
    setTables(curr => curr.map(t => t.id === id ? { ...t, label: nextLabel } : t)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })));
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setTables(before);
      setError(e instanceof Error ? e.message : "Couldn't rename");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tables/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
      setTables(curr => curr.filter(t => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate/10 bg-white p-5">
        <header className="mb-3 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
            {tables.length} table{tables.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            {!bulkOpen ? (
              <button
                onClick={() => setBulkOpen(true)}
                className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
              >
                Bulk add
              </button>
            ) : null}
            {!adding ? (
              <button
                onClick={() => setAdding(true)}
                className="rounded-full bg-slate px-3 py-1 text-xs text-oat hover:bg-slate/90"
              >
                + Add table
              </button>
            ) : null}
          </div>
        </header>

        {adding ? (
          <AddOneForm
            disabled={pending === "add"}
            onCancel={() => setAdding(false)}
            onSubmit={addOne}
          />
        ) : null}
        {bulkOpen ? (
          <BulkForm
            disabled={pending === "bulk"}
            onCancel={() => setBulkOpen(false)}
            onSubmit={addBulk}
          />
        ) : null}

        {tables.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate/55">No tables yet. Add one above.</p>
        ) : (
          <ul className="divide-y divide-slate/5">
            {tables.map(t => (
              <Row key={t.id} t={t} onRename={rename} onDelete={remove} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({
  t,
  onRename,
  onDelete,
}: {
  t: TableRow;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.label);
  const hasHistory = t.sessionCount > 0 || t.requestCount > 0 || t.preOrderCount > 0;

  if (editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-3">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={40}
          className="flex-1 rounded border border-slate/15 bg-white px-3 py-1.5 text-sm"
        />
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => { if (draft.trim() && draft.trim() !== t.label) onRename(t.id, draft.trim()); setEditing(false); }}
            className="rounded-full bg-slate px-3 py-1 text-xs text-oat"
          >
            Save
          </button>
          <button
            onClick={() => { setDraft(t.label); setEditing(false); }}
            className="text-[12px] text-slate/55 hover:text-slate"
          >
            cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t.label}</p>
        <p className="font-mono text-[11px] text-slate/50">
          {t.zone ?? "no zone"} · {t.sessionCount} session{t.sessionCount === 1 ? "" : "s"}
          {hasHistory ? "" : " · safe to delete"}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          onClick={() => setEditing(true)}
          className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
        >
          Rename
        </button>
        <button
          onClick={() => {
            const ok = confirm(
              hasHistory
                ? `${t.label} has past activity. Delete will be refused. Continue?`
                : `Delete ${t.label}? This can't be undone.`
            );
            if (ok) onDelete(t.id);
          }}
          className="rounded-full border border-coral/30 px-3 py-1 text-xs text-coral hover:bg-coral/5"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function AddOneForm({
  disabled,
  onCancel,
  onSubmit,
}: {
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (label: string, zone: string | null) => void;
}) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const label = String(fd.get("label") ?? "").trim();
        const zone = String(fd.get("zone") ?? "").trim();
        if (label) onSubmit(label, zone || null);
      }}
      className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2"
    >
      <input name="label" required maxLength={40} placeholder="Table 7 / Patio 3 / Bar Right"
        className="rounded border border-slate/15 bg-white px-3 py-1.5 text-sm" />
      <input name="zone" maxLength={40} placeholder="Zone (optional)"
        className="rounded border border-slate/15 bg-white px-3 py-1.5 text-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className="rounded-full bg-slate px-3 py-1 text-xs text-oat disabled:opacity-50">
          {disabled ? "…" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12px] text-slate/55 hover:text-slate">cancel</button>
      </div>
    </form>
  );
}

function BulkForm({
  disabled,
  onCancel,
  onSubmit,
}: {
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (count: number, zone: string | null) => void;
}) {
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const count = Number(fd.get("count") ?? 0);
        const zone = String(fd.get("zone") ?? "").trim();
        if (count > 0) onSubmit(count, zone || null);
      }}
      className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2"
    >
      <input name="count" type="number" min={1} max={60} defaultValue={5} required
        className="rounded border border-slate/15 bg-white px-3 py-1.5 text-sm" />
      <input name="zone" maxLength={40} placeholder="Zone (optional)"
        className="rounded border border-slate/15 bg-white px-3 py-1.5 text-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className="rounded-full bg-slate px-3 py-1 text-xs text-oat disabled:opacity-50">
          {disabled ? "…" : "Bulk add"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12px] text-slate/55 hover:text-slate">cancel</button>
      </div>
    </form>
  );
}
