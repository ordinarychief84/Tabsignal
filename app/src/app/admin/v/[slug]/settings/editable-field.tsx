"use client";

import { useState } from "react";

type Field =
  | "name"
  | "address"
  | "zipCode"
  | "timezone"
  | "googlePlaceId"
  | "brandColor"
  | "logoUrl"
  | "alertEmails";

export function EditableField({
  slug,
  field,
  label,
  initial,
  placeholder,
  help,
  pattern,
}: {
  slug: string;
  field: Field;
  label: string;
  initial: string;
  placeholder?: string;
  help?: string;
  pattern?: string;
}) {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = value.trim();
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next === "" ? null : next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setValue(initial);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-slate/5 py-2 last:border-0">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
          <p className="truncate text-sm text-slate">{value || <span className="text-slate/40">— not set —</span>}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-slate/15 px-3 py-1.5 text-[11px] font-medium text-slate/70 hover:text-slate"
        >
          {value ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate/5 py-3 last:border-0">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</p>
      {help ? <p className="mt-1 text-[11px] text-slate/55">{help}</p> : null}
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        pattern={pattern}
        className="mt-2 block w-full rounded-xl border border-slate/15 bg-white px-4 py-2.5 font-mono text-sm text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      />
      {error ? (
        <p className="mt-2 text-sm text-coral">{error}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-chartreuse px-4 py-1.5 text-sm font-medium text-slate disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="text-sm text-slate/55 underline-offset-4 hover:text-slate hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
