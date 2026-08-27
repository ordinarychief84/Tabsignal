"use client";

import { useEffect, useRef, useState } from "react";
import { PairingsField } from "./pairings-field";
import { SUGGESTED_TAGS } from "@/lib/menu-discovery";
import { uploadErrorMessage } from "@/lib/upload-errors";

/**
 * One menu item, edited properly.
 *
 * This replaces a pair of window.prompt() calls that asked for a name and
 * a price and nothing else — which meant description, photo, tags and
 * category were all unreachable from the product, despite the API and the
 * image-upload endpoint having supported them the whole time. Tags in
 * particular were load-bearing: they drive the guest's "what are you in
 * the mood for?" row, so with no way to set them that feature could never
 * light up.
 *
 * A drawer rather than a separate page: adding six items in a row is the
 * normal case, and losing the list behind a navigation each time is what
 * makes people stop after two.
 */

export type EditableItem = {
  id: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  categoryId: string | null;
  imageUrl: string | null;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  ageRestricted: boolean;
};

export function ItemEditor({
  slug,
  item,
  categories,
  menuItems,
  onSave,
  onClose,
}: {
  slug: string;
  item: EditableItem;
  categories: { id: string; name: string }[];
  /**
   * The rest of the menu, so pairings can be chosen from it. Passed down
   * rather than fetched here — the panel already has the whole list.
   */
  menuItems: { id: string; name: string; isActive: boolean }[];
  onSave: (saved: EditableItem) => Promise<void> | void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EditableItem>(item);
  const [priceText, setPriceText] = useState(
    item.priceCents ? (item.priceCents / 100).toFixed(2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const priceCents = parsePrice(priceText);
  const canSave = draft.name.trim().length > 0 && priceCents !== null && !busy;

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (draft.id) form.append("itemId", draft.id);
      const res = await fetch(`/api/admin/v/${slug}/menu/items/upload`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      // Never show the raw detail: STORAGE_NOT_CONFIGURED arrives with
      // "Set SUPABASE_SERVICE_ROLE_KEY in env", which is a developer
      // instruction in front of a restaurant owner — and the reason
      // somebody concludes the product can't do photos at all.
      if (!res.ok) throw new Error(uploadErrorMessage(body, res.status));
      setDraft(d => ({ ...d, imageUrl: body.url ?? body.imageUrl ?? null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that image");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!canSave || priceCents === null) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...draft, priceCents });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setBusy(false);
    }
  }

  function toggleTag(tag: string) {
    setDraft(d => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter(t => t !== tag) : [...d.tags, tag].slice(0, 8),
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate/30 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? `Edit ${item.name}` : "New menu item"}
        className="flex h-full w-full max-w-lg flex-col bg-oat shadow-lift"
      >
        <header className="flex items-center justify-between border-b border-umber-soft/30 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate">
            {draft.id ? "Edit item" : "New item"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate/50 hover:bg-slate/5 hover:text-slate"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Photo first: it's the field people didn't know existed. */}
          <div>
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Photo</span>
            <div className="mt-2 flex items-center gap-4">
              {draft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.imageUrl}
                  alt=""
                  className="h-24 w-24 shrink-0 rounded-2xl object-cover ring-1 ring-umber-soft/40"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-umber-soft/60 text-2xl text-slate/25"
                >
                  ▦
                </div>
              )}
              <div className="min-w-0 flex-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="min-h-[40px] rounded-xl border border-slate/20 px-4 text-sm text-slate hover:bg-slate/5 disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : draft.imageUrl ? "Replace photo" : "Add a photo"}
                </button>
                {draft.imageUrl ? (
                  <button
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, imageUrl: null }))}
                    className="ml-2 min-h-[40px] px-2 text-sm text-slate/50 hover:text-coral"
                  >
                    Remove
                  </button>
                ) : null}
                <p className="mt-1.5 text-[11px] leading-snug text-slate/45">
                  JPG, PNG or WebP, up to 4&nbsp;MB. Guests see this on the menu.
                </p>
              </div>
            </div>
          </div>

          <Field label="Name">
            <input
              ref={nameRef}
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              maxLength={120}
              placeholder="Margherita"
              className={inputClass}
            />
          </Field>

          <Field label="Description" hint="Optional. Shown under the name.">
            <textarea
              value={draft.description ?? ""}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value || null }))}
              maxLength={500}
              rows={2}
              placeholder="Tomato, mozzarella, basil"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price">
              <div className="relative">
                <span aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate/40">$</span>
                <input
                  value={priceText}
                  onChange={e => setPriceText(e.target.value)}
                  inputMode="decimal"
                  placeholder="14.00"
                  aria-invalid={priceText.length > 0 && priceCents === null}
                  className={`${inputClass} pl-7`}
                />
              </div>
              {priceText.length > 0 && priceCents === null ? (
                <p className="mt-1 text-[11px] text-coral">That doesn&rsquo;t read as a price.</p>
              ) : null}
            </Field>

            <Field label="Category">
              <select
                value={draft.categoryId ?? ""}
                onChange={e => setDraft(d => ({ ...d, categoryId: e.target.value || null }))}
                className={inputClass}
              >
                <option value="">No category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Tags</span>
            <p className="mt-1 text-[11px] leading-relaxed text-slate/50">
              These power the guest&rsquo;s &ldquo;what are you in the mood for?&rdquo;
              prompts. An untagged menu simply doesn&rsquo;t show that row.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map(tag => {
                const on = draft.tags.includes(tag);
                return (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed={on}
                      className={[
                        "min-h-[36px] rounded-full border px-3 text-[13px] transition-colors",
                        on
                          ? "border-transparent bg-slate font-medium text-oat"
                          : "border-umber-soft/50 bg-white text-slate/70 hover:text-slate",
                      ].join(" ")}
                    >
                      {tag}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Where "pairs well with" gets written down. TabCall can't
              infer it — there's no basket and no bill to infer from — so
              without this field the guest-side suggestion would be real
              and permanently empty. */}
          <PairingsField
            slug={slug}
            itemId={draft.id ?? null}
            itemName={draft.name}
            candidates={menuItems}
          />

          <div className="space-y-2.5 rounded-2xl border border-umber-soft/30 bg-white p-4">
            <Toggle
              label="Available"
              hint="Off is the 86 switch — hidden from guests, kept on your menu."
              checked={draft.isActive}
              onChange={v => setDraft(d => ({ ...d, isActive: v }))}
            />
            <Toggle
              label="Featured"
              hint="Shows in “Featured tonight” on the guest home."
              checked={draft.isFeatured}
              onChange={v => setDraft(d => ({ ...d, isFeatured: v }))}
            />
            <Toggle
              label="Age restricted"
              hint="Prompts staff for an ID check on the first one."
              checked={draft.ageRestricted}
              onChange={v => setDraft(d => ({ ...d, ageRestricted: v }))}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-xl bg-coral/10 px-3.5 py-2.5 text-[13px] text-coral">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex gap-3 border-t border-umber-soft/30 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 rounded-xl border border-slate/15 text-sm text-slate hover:bg-slate/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="min-h-[44px] flex-[2] rounded-xl bg-slate text-sm font-medium text-oat disabled:opacity-50"
          >
            {busy ? "Saving…" : draft.id ? "Save changes" : "Add to menu"}
          </button>
        </footer>
      </div>
    </div>
  );
}

const inputClass =
  "mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 bg-white px-3.5 py-2.5 text-sm text-slate outline-none focus:border-sea focus:ring-2 focus:ring-sea/25";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.16em] text-umber">{label}</span>
      {hint ? <span className="ml-2 text-[11px] text-slate/45">{hint}</span> : null}
      {children}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-umber-soft/60 accent-slate"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-slate/55">{hint}</span>
      </span>
    </label>
  );
}

/** Same tolerance as the bulk importer, minus the guessing. */
function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[a-z]/i.test(trimmed)) return null;
  const cleaned = trimmed.replace(/[^\d.]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100_000) return null;
  return Math.round(value * 100);
}
