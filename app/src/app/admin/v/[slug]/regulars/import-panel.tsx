"use client";

import { useState } from "react";

type Result = {
  rowsAccepted: number;
  rowsRejected: number;
  profilesCreated: number;
  profilesUpdated: number;
  notesAdded: number;
  errors: Array<{ line: number; reason: string; raw: string }>;
};

const PLACEHOLDER = `phone,displayName,note
+1-555-0100,Sarah,Allergic to peanuts; usual is Negroni neat
+1-555-0123,Marco,Birthday Aug 14; comes with partner Mike
+1-555-0177,,Tips well; sits at the bar`;

export function ImportPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) {
      setError("File too large (max 200KB).");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setError(null);
  }

  async function submit() {
    if (!csv.trim()) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/regulars/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      setResult(body as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate/15 bg-white px-4 py-1.5 text-sm text-slate/80 hover:border-slate/40"
      >
        + Import regulars from CSV
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-slate/10 bg-white p-5">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.16em] text-umber">Import CSV</h2>
        <button
          onClick={() => { setOpen(false); setCsv(""); setError(null); setResult(null); }}
          className="text-[11px] text-slate/55 hover:text-slate"
        >
          close
        </button>
      </header>

      <p className="text-xs text-slate/60">
        Pre-seed your regulars from a list — phone, name (optional), note (optional).
        500 rows max. Imported guests appear in your dossier as soon as they identify
        via QR + phone OTP.
      </p>

      <div className="mt-4 space-y-3">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={onFile}
          className="block w-full text-xs text-slate/70 file:mr-3 file:rounded file:border file:border-slate/15 file:bg-white file:px-3 file:py-1.5 file:text-xs"
        />
        <textarea
          value={csv}
          onChange={e => setCsv(e.target.value)}
          rows={6}
          placeholder={PLACEHOLDER}
          className="w-full rounded border border-slate/15 bg-white p-3 font-mono text-[11px]"
        />

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-slate/45">
            Phone is required. Header row optional. Embedded commas need to be quoted.
          </p>
          <button
            onClick={submit}
            disabled={pending || !csv.trim()}
            className="rounded-full bg-slate px-4 py-1.5 text-sm text-oat hover:bg-slate/90 disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import"}
          </button>
        </div>

        {error ? (
          <p className="rounded border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">{error}</p>
        ) : null}

        {result ? (
          <div className="rounded-lg border border-chartreuse/40 bg-chartreuse/10 px-3 py-3">
            <p className="text-sm font-medium text-slate">
              Imported {result.rowsAccepted} row{result.rowsAccepted === 1 ? "" : "s"} —
              {" "}{result.profilesCreated} new, {result.profilesUpdated} updated,
              {" "}{result.notesAdded} note{result.notesAdded === 1 ? "" : "s"} added.
            </p>
            {result.rowsRejected > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-coral">
                  {result.rowsRejected} row{result.rowsRejected === 1 ? "" : "s"} rejected
                </summary>
                <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate/65">
                  {result.errors.map((e, i) => (
                    <li key={i}>line {e.line}: {e.reason} — {e.raw.slice(0, 80)}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
