"use client";

import Link from "next/link";
import { useState } from "react";

type PromotionRow = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  bannerImageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
  itemCount: number;
};

const TYPE_LABELS: Record<string, string> = {
  HAPPY_HOUR: "Happy hour",
  BUSINESS_LUNCH: "Business lunch",
  BANNER: "Banner",
  LIMITED_TIME_ITEM: "Limited time",
  NEW_ITEM: "New item",
  DISCOUNT_HIGHLIGHT: "Discount",
};

export function PromotionsList({
  slug,
  initial,
}: {
  slug: string;
  initial: PromotionRow[];
}) {
  const [rows, setRows] = useState<PromotionRow[]>(initial);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: PromotionRow["status"]) {
    setError(null);
    const before = rows;
    setRows(curr => curr.map(r => (r.id === id ? { ...r, status } : r)));
    try {
      const res = await fetch(`/api/admin/v/${slug}/promotions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setRows(before);
      setError(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/promotions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(curr => curr.filter(r => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
        No promotions yet. Create one to surface a happy hour, banner, or
        time-boxed special on the guest screens.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {rows.map(p => (
          <li
            key={p.id}
            className={[
              "rounded-2xl border p-5",
              p.status === "ACTIVE"
                ? "border-chartreuse/50 bg-chartreuse/10"
                : p.status === "EXPIRED"
                ? "border-coral/40 bg-coral/5"
                : "border-slate/15 bg-slate/5",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-medium">{p.title}</h3>
                  <span className="rounded-full bg-sea/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate/80">
                    {TYPE_LABELS[p.type] ?? p.type}
                  </span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                      p.status === "ACTIVE"
                        ? "bg-chartreuse/60 text-slate"
                        : p.status === "EXPIRED"
                        ? "bg-coral/30 text-coral"
                        : "bg-slate/15 text-slate/60",
                    ].join(" ")}
                  >
                    {p.status.toLowerCase()}
                  </span>
                </div>
                {p.description ? (
                  <p className="mt-1 text-sm text-slate/65">{p.description}</p>
                ) : null}
                <p className="mt-2 font-mono text-[11px] text-slate/55">
                  {formatWindow(p.startsAt, p.endsAt)}
                  {p.itemCount > 0 ? ` · ${p.itemCount} linked item${p.itemCount === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Link
                  href={`/admin/v/${slug}/promotions/${p.id}`}
                  className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
                >
                  Edit
                </Link>
                {p.status === "ACTIVE" ? (
                  <button
                    onClick={() => setStatus(p.id, "INACTIVE")}
                    className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus(p.id, "ACTIVE")}
                    className="rounded-full border border-slate/15 px-3 py-1 text-xs text-slate/70 hover:border-slate/40"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => remove(p.id, p.title)}
                  className="rounded-full border border-coral/30 px-3 py-1 text-xs text-coral hover:bg-coral/5"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatWindow(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return "Always on";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
  if (startsAt && endsAt) return `${fmt(startsAt)} → ${fmt(endsAt)}`;
  if (startsAt) return `From ${fmt(startsAt)}`;
  return `Until ${fmt(endsAt!)}`;
}
