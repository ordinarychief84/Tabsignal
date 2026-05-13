"use client";

import { useState } from "react";

type Special = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

export function SpecialsPanel({ slug, initial }: { slug: string; initial: Special[] }) {
  const [specials, setSpecials] = useState<Special[]>(initial);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(form: SpecialForm) {
    setBusy("create");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/specials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setSpecials(curr => [{
        id: body.id,
        title: form.title,
        description: form.description ?? null,
        priceCents: form.priceCents ?? null,
        startsAt: form.startsAt ?? null,
        endsAt: form.endsAt ?? null,
        active: form.active,
      }, ...curr]);
      setCreating(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function update(id: string, patch: Partial<SpecialForm>) {
    setError(null);
    const before = specials;
    setSpecials(curr => curr.map(s => s.id === id ? { ...s, ...patch } as Special : s));
    try {
      const res = await fetch(`/api/admin/v/${slug}/specials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setSpecials(before);
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/specials/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSpecials(curr => curr.filter(s => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90"
        >
          + New special
        </button>
      ) : (
        <SpecialEditor
          submitLabel={busy === "create" ? "Saving…" : "Save"}
          onSubmit={create}
          onCancel={() => { setCreating(false); setError(null); }}
        />
      )}

      {specials.length === 0 ? (
        <p className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
          No specials yet. The guest QR landing won&rsquo;t show a promo strip.
        </p>
      ) : (
        <ul className="space-y-3">
          {specials.map(s => (
            <SpecialRow
              key={s.id}
              special={s}
              onUpdate={patch => update(s.id, patch)}
              onDelete={() => {
                if (confirm(`Delete "${s.title}"?`)) remove(s.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type SpecialForm = {
  title: string;
  description: string | null;
  priceCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
};

function SpecialRow({
  special,
  onUpdate,
  onDelete,
}: {
  special: Special;
  onUpdate: (patch: Partial<SpecialForm>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li>
        <SpecialEditor
          submitLabel="Save"
          initial={special}
          onSubmit={form => { onUpdate(form); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  const live = isLive(special);
  const window = formatWindow(special.startsAt, special.endsAt);
  return (
    <li className="rounded-2xl border border-slate/10 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium">{special.title}</h3>
            <span className={[
              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
              !special.active ? "bg-slate/10 text-slate/50"
                : live ? "bg-chartreuse/40 text-slate"
                : "bg-coral/15 text-coral",
            ].join(" ")}>
              {!special.active ? "paused" : live ? "live" : "scheduled"}
            </span>
          </div>
          {special.description ? (
            <p className="mt-1 text-sm text-slate/65">{special.description}</p>
          ) : null}
          <p className="mt-2 font-mono text-[11px] text-slate/55">
            {special.priceCents !== null ? `$${(special.priceCents / 100).toFixed(2)} · ` : ""}
            {window}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => onUpdate({ active: !special.active })}
            className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
          >
            {special.active ? "Pause" : "Activate"}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="rounded-full border border-coral/30 px-3 py-1 text-xs text-coral hover:bg-coral/5"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function SpecialEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Special;
  submitLabel: string;
  onSubmit: (form: SpecialForm) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceDollars, setPriceDollars] = useState(initial?.priceCents !== null && initial?.priceCents !== undefined
    ? (initial.priceCents / 100).toFixed(2)
    : ""
  );
  const [startsAt, setStartsAt] = useState(initial?.startsAt ? toLocalInput(initial.startsAt) : "");
  const [endsAt, setEndsAt] = useState(initial?.endsAt ? toLocalInput(initial.endsAt) : "");
  const [active, setActive] = useState(initial?.active ?? true);

  function submit() {
    const cents = priceDollars.trim() ? Math.round(Number(priceDollars) * 100) : null;
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      priceCents: cents,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      active,
    });
  }

  return (
    <section className="rounded-2xl border border-slate/15 bg-white p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Special</p>
      <div className="mt-4 space-y-3">
        <Field label="Title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            placeholder="$5 Margaritas till 7"
            className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Made with Cazadores Reposado, fresh lime."
            className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Price (USD, optional)">
            <input
              type="number"
              step="0.01"
              min={0}
              value={priceDollars}
              onChange={e => setPriceDollars(e.target.value)}
              placeholder="5.00"
              className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Starts (optional)">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={e => setStartsAt(e.target.value)}
              className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Ends (optional)">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          <span>Active. Guests see this on the QR landing</span>
        </label>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="rounded-full bg-chartreuse px-4 py-1.5 text-sm font-medium text-slate disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button onClick={onCancel} className="text-[12px] text-slate/55 hover:text-slate">
          cancel
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function isLive(s: Special): boolean {
  if (!s.active) return false;
  const now = Date.now();
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return false;
  if (s.endsAt && new Date(s.endsAt).getTime() <= now) return false;
  return true;
}

function formatWindow(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return "Always on";
  const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  if (startsAt && endsAt) return `${fmt(startsAt)} → ${fmt(endsAt)}`;
  if (startsAt) return `From ${fmt(startsAt)}`;
  return `Until ${fmt(endsAt!)}`;
}

function toLocalInput(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in LOCAL tz.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
