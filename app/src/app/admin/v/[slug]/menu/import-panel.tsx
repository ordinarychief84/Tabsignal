"use client";

import { useMemo, useState } from "react";
import { parseMenuText } from "@/lib/menu-import";

/**
 * Paste a menu you already have.
 *
 * Every venue arrives with their menu written down somewhere — a
 * spreadsheet, a Word doc, the back of a printed card. Adding forty items
 * one at a time is the reason menus don't get finished, and an unfinished
 * menu means the guest side has nothing to show.
 *
 * Parsing happens HERE, in the browser, so the venue sees exactly what
 * will be created before anything is written — including which lines
 * couldn't be read and why. The server re-validates on submit; the
 * preview is a courtesy, not a security boundary.
 *
 * Import adds, never replaces. Pasting one section into a venue that
 * already has a menu is the common case, and silently wiping the rest
 * would be unrecoverable.
 */
export function ImportPanel({
  slug,
  onImported,
  onClose,
}: {
  slug: string;
  onImported: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseMenuText(text), [text]);
  const canImport = parsed.items.length > 0 && !busy;

  async function submit() {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/menu/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: parsed.items.map(i => ({
            name: i.name,
            priceCents: i.priceCents,
            description: i.description,
            tags: i.tags,
            category: i.category,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate/30 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import a menu"
        className="flex h-full w-full max-w-2xl flex-col bg-oat shadow-lift"
      >
        <header className="flex items-center justify-between border-b border-umber-soft/30 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate">Import a menu</h2>
            <p className="text-[12px] text-slate/55">
              Paste from a spreadsheet or type it out. Nothing is saved until you say so.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate/50 hover:bg-slate/5 hover:text-slate"
          >
            ✕
          </button>
        </header>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-2">
          <div className="flex flex-col">
            <label htmlFor="menu-paste" className="text-[11px] uppercase tracking-[0.16em] text-umber">
              Your menu
            </label>
            <textarea
              id="menu-paste"
              value={text}
              onChange={e => setText(e.target.value)}
              spellCheck={false}
              placeholder={PLACEHOLDER}
              className="mt-2 min-h-[280px] flex-1 rounded-xl border border-umber-soft/40 bg-white p-3.5 font-mono text-[13px] leading-relaxed text-slate outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate/50">
              One item per line: name, then price. Separate with a comma, a tab
              or a pipe — or just a space. Start a line with{" "}
              <code className="rounded bg-slate/5 px-1">##</code> to begin a category.
            </p>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
              What will be created
            </span>

            {text.trim().length === 0 ? (
              <p className="mt-3 text-[13px] text-slate/45">
                Paste something and you&rsquo;ll see it here first.
              </p>
            ) : (
              <>
                <p className="mt-2 text-[13px] text-slate/70">
                  <strong className="font-mono tabular-nums">{parsed.items.length}</strong>{" "}
                  {parsed.items.length === 1 ? "item" : "items"}
                  {parsed.categories.length > 0
                    ? ` across ${parsed.categories.length} ${parsed.categories.length === 1 ? "category" : "categories"}`
                    : ""}
                </p>

                {parsed.errors.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-coral/40 bg-coral/5 p-3">
                    <p className="text-[12px] font-medium text-coral">
                      {parsed.errors.length}{" "}
                      {parsed.errors.length === 1 ? "line" : "lines"} skipped
                    </p>
                    {/* Named, not summarised — a venue needs to know which
                        line to fix, and we never guess a price. */}
                    <ul className="mt-1.5 space-y-1">
                      {parsed.errors.slice(0, 6).map(e => (
                        <li key={e.line} className="text-[11px] leading-snug text-slate/70">
                          <span className="font-mono">L{e.line}</span> · {e.reason} —{" "}
                          <span className="text-slate/50">{e.text.slice(0, 40)}</span>
                        </li>
                      ))}
                      {parsed.errors.length > 6 ? (
                        <li className="text-[11px] text-slate/50">
                          …and {parsed.errors.length - 6} more
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}

                <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
                  {parsed.items.slice(0, 60).map(item => (
                    <li
                      key={item.line}
                      className="flex items-baseline justify-between gap-3 rounded-lg bg-white px-3 py-2 text-[13px] ring-1 ring-umber-soft/25"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate">{item.name}</span>
                        {item.category ? (
                          <span className="ml-2 text-[11px] text-slate/45">{item.category}</span>
                        ) : null}
                        {item.tags.length > 0 ? (
                          <span className="ml-2 text-[11px] text-umber">
                            {item.tags.join(" · ")}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-slate/70">
                        ${(item.priceCents / 100).toFixed(2)}
                      </span>
                    </li>
                  ))}
                  {parsed.items.length > 60 ? (
                    <li className="px-3 py-1 text-[11px] text-slate/50">
                      …and {parsed.items.length - 60} more
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        </div>

        {error ? (
          <p role="alert" className="mx-5 rounded-xl bg-coral/10 px-3.5 py-2.5 text-[13px] text-coral">
            {error}
          </p>
        ) : null}

        <footer className="flex items-center gap-3 border-t border-umber-soft/30 px-5 py-4">
          <p className="flex-1 text-[11px] leading-snug text-slate/50">
            Adds to your menu. Nothing already on it is changed or removed.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl border border-slate/15 px-4 text-sm text-slate hover:bg-slate/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canImport}
            className="min-h-[44px] rounded-xl bg-slate px-5 text-sm font-medium text-oat disabled:opacity-50"
          >
            {busy
              ? "Importing…"
              : `Import ${parsed.items.length || ""} ${parsed.items.length === 1 ? "item" : "items"}`.trim()}
          </button>
        </footer>
      </div>
    </div>
  );
}

const PLACEHOLDER = `## Small plates
Olives, 6, Marinated with orange peel, light
Focaccia | 7 | Rosemary and sea salt

## Pizza
Margherita, 14.00, Tomato, mozzarella, basil
Diavola	16.50	Spicy salami, chilli honey, bold

## Drinks
Negroni 15
Espresso Martini 16`;
