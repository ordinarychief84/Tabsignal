"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type PromotionType =
  | "HAPPY_HOUR"
  | "BUSINESS_LUNCH"
  | "BANNER"
  | "LIMITED_TIME_ITEM"
  | "NEW_ITEM"
  | "DISCOUNT_HIGHLIGHT";

export type PromotionStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export type PromotionFormInitial = {
  id: string;
  title: string;
  description: string | null;
  type: PromotionType;
  bannerImageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: PromotionStatus;
  menuItemIds: string[];
};

const TYPE_OPTIONS: { value: PromotionType; label: string; hint: string }[] = [
  { value: "HAPPY_HOUR", label: "Happy hour", hint: "Chartreuse pill on the guest screens." },
  { value: "BUSINESS_LUNCH", label: "Business lunch", hint: "Chartreuse pill, weekday lunch crowd." },
  { value: "BANNER", label: "Banner", hint: "Full-width sea-tinted card on the menu + QR landing." },
  { value: "LIMITED_TIME_ITEM", label: "Limited time", hint: "Badge next to linked menu items." },
  { value: "NEW_ITEM", label: "New item", hint: "Badge next to linked menu items." },
  { value: "DISCOUNT_HIGHLIGHT", label: "Discount", hint: "Badge next to linked menu items." },
];

type MenuItemLite = { id: string; name: string };

export function PromotionForm({
  slug,
  mode,
  initial,
}: {
  slug: string;
  mode: "create" | "edit";
  initial?: PromotionFormInitial;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState<PromotionType>(initial?.type ?? "BANNER");
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(initial?.bannerImageUrl ?? null);
  const [startsAt, setStartsAt] = useState<string>(
    initial?.startsAt ? toLocalInput(initial.startsAt) : ""
  );
  const [endsAt, setEndsAt] = useState<string>(
    initial?.endsAt ? toLocalInput(initial.endsAt) : ""
  );
  const [status, setStatus] = useState<PromotionStatus>(initial?.status ?? "ACTIVE");
  const [menuItemIds, setMenuItemIds] = useState<string[]>(initial?.menuItemIds ?? []);

  const [menuItems, setMenuItems] = useState<MenuItemLite[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pull the menu items once. The simple-flag endpoint isn't a thing yet,
  // so we hit the regular list endpoint and project down to id + name.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/v/${slug}/menu/items?simple=1`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const items: MenuItemLite[] = Array.isArray(body?.items)
          ? body.items.map((it: { id: string; name: string }) => ({ id: it.id, name: it.name }))
          : [];
        setMenuItems(items);
      } catch {
        // Silent failure — the multi-select just stays empty + the user
        // can still save a promo without linking items.
        if (!cancelled) setMenuItems([]);
      } finally {
        if (!cancelled) setMenuLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const itemsByCount = useMemo(() => menuItemIds.length, [menuItemIds]);

  function toggleItem(id: string) {
    setMenuItemIds(curr =>
      curr.includes(id) ? curr.filter(x => x !== id) : [...curr, id]
    );
  }

  async function uploadBanner(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/v/${slug}/promotions/banner`, {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setBannerImageUrl(body.bannerImageUrl as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      bannerImageUrl: bannerImageUrl ?? null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      menuItemIds,
      ...(mode === "edit" ? { status } : {}),
    };
    setBusy(true);
    try {
      const url =
        mode === "create"
          ? `/api/admin/v/${slug}/promotions`
          : `/api/admin/v/${slug}/promotions/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      router.push(`/admin/v/${slug}/promotions`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map(opt => {
            const active = opt.value === type;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs",
                  active
                    ? "border-chartreuse bg-chartreuse/40 text-slate"
                    : "border-slate/15 bg-white text-slate/70 hover:border-slate/30",
                ].join(" ")}
                title={opt.hint}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-slate/55">
          {TYPE_OPTIONS.find(t => t.value === type)?.hint}
        </p>
      </Field>

      <Field label="Title">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={120}
          placeholder="$5 well drinks until 7"
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Mon–Fri, while you wait for your table."
          className="w-full rounded border border-slate/15 bg-white px-3 py-2 text-sm"
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
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

      {mode === "edit" ? (
        <Field label="Status">
          <select
            value={status}
            onChange={e => setStatus(e.target.value as PromotionStatus)}
            className="rounded border border-slate/15 bg-white px-3 py-2 text-sm"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </Field>
      ) : null}

      <Field label="Banner image (optional)">
        {bannerImageUrl ? (
          <div className="flex items-start gap-3">
            <img
              src={bannerImageUrl}
              alt=""
              className="h-24 w-40 rounded border border-slate/15 object-cover"
            />
            <button
              type="button"
              onClick={() => setBannerImageUrl(null)}
              className="text-xs text-coral hover:underline"
            >
              Remove
            </button>
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void uploadBanner(f);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="text-xs"
          />
          {uploading ? <span className="text-[11px] text-slate/55">uploading…</span> : null}
        </div>
        <p className="mt-1 text-[11px] text-slate/55">
          PNG / JPG / WEBP / SVG / GIF up to 5 MB. Used for BANNER-type promotions.
        </p>
      </Field>

      <Field label={`Linked menu items (${itemsByCount} selected)`}>
        {menuLoading ? (
          <p className="text-xs text-slate/55">Loading menu…</p>
        ) : menuItems.length === 0 ? (
          <p className="text-xs text-slate/55">
            No menu items yet. Add some under Menu first, then come back to link them.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto rounded border border-slate/10 bg-white">
            <ul className="divide-y divide-slate/5">
              {menuItems.map(it => {
                const checked = menuItemIds.includes(it.id);
                return (
                  <li key={it.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate/5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(it.id)}
                      />
                      <span>{it.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="mt-1 text-[11px] text-slate/55">
          For LIMITED_TIME_ITEM / NEW_ITEM / DISCOUNT_HIGHLIGHT promotions, the
          guest menu shows a small badge next to each linked item.
        </p>
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !title.trim()}
          className="rounded-full bg-chartreuse px-5 py-2 text-sm font-medium text-slate disabled:opacity-50"
        >
          {busy ? "Saving…" : mode === "create" ? "Create promotion" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/admin/v/${slug}/promotions`)}
          className="text-sm text-slate/55 hover:text-slate"
        >
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

function toLocalInput(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:MM" in LOCAL tz.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
