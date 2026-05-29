"use client";

import { useState } from "react";

type TableRow = {
  id: string;
  label: string;
  zone: string | null;
  sessionCount: number;
  requestCount: number;
  preOrderCount: number;
  staffIds: string[];
};

type StaffOption = {
  id: string;
  name: string;
  role: string;
  status: string;
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SERVER: "Server",
  HOST: "Host",
  VIEWER: "Viewer",
  STAFF: "Staff",
};

export function TablesPanel({
  slug,
  initial,
  staff,
  canAssignStaff,
}: {
  slug: string;
  initial: TableRow[];
  staff: StaffOption[];
  canAssignStaff: boolean;
}) {
  const [tables, setTables] = useState<TableRow[]>(initial);
  const [adding, setAdding] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which table's server-assignment editor is open (one at a time).
  const [editingStaffFor, setEditingStaffFor] = useState<string | null>(null);

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
        sessionCount: 0, requestCount: 0, preOrderCount: 0, staffIds: [],
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
        ...created.map(c => ({ id: c.id, label: c.label, zone, sessionCount: 0, requestCount: 0, preOrderCount: 0, staffIds: [] })),
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

  // Replace the full set of servers covering one table. Optimistic; rolls
  // back on failure. Hits the table-centric counterpart of the People
  // page's per-staff assignment route.
  async function saveStaffAssignment(tableId: string, staffIds: string[]) {
    const before = tables;
    setTables(curr => curr.map(t => (t.id === tableId ? { ...t, staffIds } : t)));
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/tables/${tableId}/staff`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setTables(before);
      setError(e instanceof Error ? e.message : "Couldn't save server assignment");
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
              <Row
                key={t.id}
                t={t}
                staff={staff}
                canAssignStaff={canAssignStaff}
                isEditingStaff={editingStaffFor === t.id}
                onToggleStaffEditor={() =>
                  setEditingStaffFor(editingStaffFor === t.id ? null : t.id)
                }
                onSaveStaffAssignment={saveStaffAssignment}
                onRename={rename}
                onDelete={remove}
              />
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
  canAssignStaff,
  isEditingStaff,
  onToggleStaffEditor,
  onSaveStaffAssignment,
  onRename,
  onDelete,
}: {
  t: TableRow;
  staff: StaffOption[];
  canAssignStaff: boolean;
  isEditingStaff: boolean;
  onToggleStaffEditor: () => void;
  onSaveStaffAssignment: (tableId: string, staffIds: string[]) => void;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(t.label);
  const hasHistory = t.sessionCount > 0 || t.requestCount > 0 || t.preOrderCount > 0;
  // Resolve assigned IDs to current roster entries. An ID with no match
  // (e.g. a since-suspended server) is silently dropped from the display.
  const assigned = staff.filter(s => t.staffIds.includes(s.id));

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
          {canAssignStaff ? (
            <button
              onClick={onToggleStaffEditor}
              className={[
                "rounded-full border px-3 py-1 text-xs transition-colors",
                isEditingStaff
                  ? "border-slate bg-slate text-oat"
                  : "border-slate/15 text-slate/70 hover:border-slate/40",
              ].join(" ")}
            >
              Servers
            </button>
          ) : null}
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
      </div>

      {/* Assigned-server chips. Shown whenever a table has coverage, so a
        * manager scanning the floor can see who's on what at a glance. */}
      {assigned.length > 0 ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate/60">
          <span className="text-slate/40">Servers:</span>
          {assigned.map(s => (
            <span key={s.id} className="rounded-full bg-sea/30 px-2 py-0.5 text-[11px] text-slate/80">
              {s.name}
            </span>
          ))}
        </p>
      ) : canAssignStaff ? (
        <p className="mt-1.5 text-[11px] text-slate/40">
          No server assigned. Requests still surface to the whole floor.
        </p>
      ) : null}

      {/* Inline server picker */}
      {isEditingStaff && canAssignStaff ? (
        <div className="mt-3 rounded-xl border border-slate/10 bg-oat/30 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
            Assign servers to {t.label}
          </p>
          <p className="mt-1 text-[11px] text-slate/55">
            Selections save automatically. Multiple servers can cover one table;
            their requests route straight to whoever you pick.
          </p>
          {staff.length === 0 ? (
            <p className="mt-3 text-[12px] text-slate/55">
              No active staff yet. Invite servers from the People page first.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {staff.map(s => {
                  const active = t.staffIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? t.staffIds.filter(id => id !== s.id)
                          : [...t.staffIds, s.id];
                        onSaveStaffAssignment(t.id, next);
                      }}
                      className={[
                        "rounded-lg border px-2 py-2 text-left text-[12px] transition-colors",
                        active
                          ? "border-slate bg-slate text-oat"
                          : "border-slate/15 bg-white text-slate/70 hover:border-slate/30",
                      ].join(" ")}
                    >
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className={active ? "text-oat/70" : "text-slate/45"}>
                        {ROLE_LABEL[s.role] ?? s.role}
                        {s.status === "INVITED" ? " · invited" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSaveStaffAssignment(t.id, staff.map(s => s.id))}
                  className="text-[11px] text-umber underline-offset-4 hover:underline"
                >
                  Assign all
                </button>
                <button
                  type="button"
                  onClick={() => onSaveStaffAssignment(t.id, [])}
                  className="text-[11px] text-umber underline-offset-4 hover:underline"
                >
                  Clear
                </button>
              </div>
            </>
          )}
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
