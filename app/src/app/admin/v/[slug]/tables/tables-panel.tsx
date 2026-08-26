"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";

type TableRow = {
  id: string;
  label: string;
  zone: string | null;
  sessionCount: number;
  /** Who covers this table. Floor names, for the chips below the label. */
  staff: { id: string; name: string }[];
  requestCount: number;
};

export function TablesPanel({
  slug,
  initial,
  staff,
  canAssign,
}: {
  slug: string;
  initial: TableRow[];
  /** Every active member, for the assignment picker. */
  staff: { id: string; name: string; role: string }[];
  /** False for roles that may see the floor but not restaff it. */
  canAssign: boolean;
}) {
  const [tables, setTables] = useState<TableRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Who covers this table, saved from here rather than from People.
   *
   * The same TableAssignment rows the People page writes — one relation
   * with two doors. An owner in front of a floor plan thinks "who has
   * 12", and until now the only answer was to open each person in turn.
   */
  async function saveStaff(tableId: string, staffIds: string[]) {
    const previous = tables;
    // Optimistic: this is a picker somebody taps through quickly.
    setTables(curr =>
      curr.map(t =>
        t.id === tableId
          ? { ...t, staff: staff.filter(s => staffIds.includes(s.id)).map(s => ({ id: s.id, name: s.name })) }
          : t,
      ),
    );
    try {
      const res = await fetch(`/api/admin/v/${slug}/tables/${tableId}/staff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
    } catch (e) {
      // Put it back. A floor plan that shows an assignment the server
      // doesn't have is worse than one that shows the change failed.
      setTables(previous);
      setError(e instanceof Error ? e.message : "Couldn't change that");
    }
  }

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
        sessionCount: 0, requestCount: 0, staff: [],
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
        ...created.map(c => ({ id: c.id, label: c.label, zone, sessionCount: 0, requestCount: 0, staff: [] })),
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
              <Row key={t.id} t={t} staff={staff} canAssign={canAssign} onRename={rename} onDelete={remove} onSaveStaff={saveStaff} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({
  t,
  staff,
  canAssign,
  onSaveStaff,
  onRename,
  onDelete,
}: {
  t: TableRow;
  staff: { id: string; name: string; role: string }[];
  canAssign: boolean;
  onSaveStaff: (tableId: string, staffIds: string[]) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.label);
  const hasHistory = t.sessionCount > 0 || t.requestCount > 0;
  const [assigning, setAssigning] = useState(false);

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
    <li className="py-3">
    <div className="flex items-center justify-between gap-4">
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
        {/* The old prompt said "Delete will be refused. Continue?" — asking
            someone to confirm an action it had already decided to reject.
            A table with history simply isn't deletable, so the control is
            disabled and says why instead of staging a doomed confirmation. */}
        {hasHistory ? (
          <span
            title="Tables with past activity can't be deleted — rename it instead, so historical records keep their table."
            className="rounded-full border border-slate/10 px-3 py-1 text-xs text-slate/35"
          >
            Delete
          </span>
        ) : (
          <ConfirmButton
            onConfirm={() => onDelete(t.id)}
            title={`Delete ${t.label}?`}
            body="Its QR tent stops working the moment this is saved. Anyone who scans the printed code will get a dead link until you print a new one."
            className="rounded-full border border-coral/30 px-3 py-1 text-xs text-coral hover:bg-coral/5"
          >
            Delete
          </ConfirmButton>
        )}
      </div>
    </div>

    {/* Who covers this table.
     *
     * The relation always existed but was only editable per PERSON, from
     * the People page, behind an overflow menu. An owner looking at a
     * floor asks "who has 12" — and the only way to answer that was to
     * open every server in turn. Same rows, second door. */}
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-slate/40">Covered by</span>
      {t.staff.length === 0 ? (
        <span className="text-[11px] text-slate/50">
          nobody yet — requests still reach the whole floor
        </span>
      ) : (
        t.staff.map(s => (
          <span
            key={s.id}
            className="rounded-full bg-sea/30 px-2 py-0.5 text-[11px] text-slate/80"
          >
            {s.name}
          </span>
        ))
      )}
      {canAssign ? (
        <button
          type="button"
          onClick={() => setAssigning(a => !a)}
          className="rounded-full border border-slate/15 px-2.5 py-0.5 text-[11px] text-slate/60 hover:border-slate/40 hover:text-slate"
        >
          {assigning ? "Done" : "Change"}
        </button>
      ) : null}
    </div>

    {assigning && canAssign ? (
      <div className="mt-2 rounded-xl border border-umber-soft/40 bg-oat/60 p-3">
        <p className="text-[11px] text-slate/55">
          Tap to add or remove. Saves as you go, and more than one person can
          cover the same table.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {staff.length === 0 ? (
            <span className="text-[12px] text-slate/50">
              Nobody active to assign yet.
            </span>
          ) : (
            staff.map(s => {
              const on = t.staff.some(x => x.id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    onSaveStaff(
                      t.id,
                      on
                        ? t.staff.filter(x => x.id !== s.id).map(x => x.id)
                        : [...t.staff.map(x => x.id), s.id],
                    )
                  }
                  aria-pressed={on}
                  className={[
                    "min-h-[36px] rounded-lg border px-3 text-[12px] transition-colors",
                    on
                      ? "border-slate bg-slate text-oat"
                      : "border-slate/15 bg-white text-slate/70 hover:border-slate/30",
                  ].join(" ")}
                >
                  {s.name}
                  <span className="ml-1.5 text-[10px] opacity-60">
                    {s.role.toLowerCase()}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    ) : null}
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
