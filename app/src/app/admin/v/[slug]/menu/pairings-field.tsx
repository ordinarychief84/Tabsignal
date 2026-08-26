"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PAIRING_RELATIONSHIPS,
  pairingAdminLabel,
  pairingLabel,
  type PairingRelationship,
} from "@/lib/pairings";

/**
 * "Pairs well with" — where a venue writes down what goes with what.
 *
 * This field is the whole reason MenuItemPairing exists. TabCall has no
 * basket, no bill and no transaction history, so it cannot infer that the
 * Barolo goes with the ragù; a chef can. Without somewhere to say it, the
 * table and the guest-side surfacing would both be real and permanently
 * empty — which is the failure this codebase keeps repeating.
 *
 * Deliberately not shown on a brand-new item. A pairing needs both ends
 * to exist, and the dish being created doesn't have an id yet. The panel
 * says so rather than presenting controls that would silently discard
 * what the owner typed.
 */

type Pairing = {
  id: string;
  suggestedId: string;
  suggestedName: string;
  suggestedActive: boolean;
  relationship: PairingRelationship;
  sortOrder: number;
};

export function PairingsField({
  slug,
  itemId,
  itemName,
  candidates,
}: {
  slug: string;
  /** Null for an item that hasn't been saved yet. */
  itemId: string | null;
  itemName: string;
  /** Every other item on this venue's menu. */
  candidates: { id: string; name: string; isActive: boolean }[];
}) {
  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [choice, setChoice] = useState("");
  const [relationship, setRelationship] = useState<PairingRelationship>("PAIRS_WITH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!itemId) return;
    try {
      const res = await fetch(`/api/admin/v/${slug}/menu/items/${itemId}/pairings`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.json();
      setPairings(body.pairings ?? []);
    } catch {
      /* the rest of the editor still works; leave the list unloaded */
    }
  }, [slug, itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!itemId) {
    return (
      <section className="rounded-xl border border-umber-soft/30 bg-white/60 p-4">
        <Heading />
        <p className="mt-2 text-[12px] leading-relaxed text-slate/55">
          Save this dish first, then you can say what goes with it.
        </p>
      </section>
    );
  }

  const taken = new Set((pairings ?? []).map(p => p.suggestedId));
  const available = candidates.filter(c => c.id !== itemId && !taken.has(c.id));

  async function add() {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/menu/items/${itemId}/pairings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestedId: choice, relationship }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? messageFor(body?.error));
      setPairings(curr => [...(curr ?? []), body.pairing]);
      setChoice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that pairing");
    } finally {
      setBusy(false);
    }
  }

  async function remove(pairingId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Optimistic: this is a small list and undoing is re-adding.
    const previous = pairings;
    setPairings(curr => (curr ?? []).filter(p => p.id !== pairingId));
    try {
      const res = await fetch(`/api/admin/v/${slug}/menu/items/${itemId}/pairings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairingId }),
      });
      if (!res.ok) throw new Error("Couldn't remove that");
    } catch (e) {
      setPairings(previous);
      setError(e instanceof Error ? e.message : "Couldn't remove that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-umber-soft/30 bg-white/60 p-4">
      <Heading />
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate/55">
        Guests see one of these while they&rsquo;re looking at {itemName || "this dish"}.
        Nothing is guessed — only what you put here.
      </p>

      {pairings && pairings.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {pairings.map(p => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-umber-soft/25"
            >
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wider text-umber">
                  {pairingAdminLabel(p.relationship)}
                </span>
                <span className="block truncate text-sm text-slate">
                  {p.suggestedName}
                  {!p.suggestedActive ? (
                    // A suggestion pointing at something off the menu is
                    // silently skipped for guests. Say so, rather than
                    // letting an owner think it's live.
                    <span className="ml-2 text-[11px] text-clay-deep">
                      off the menu — guests won&rsquo;t see this
                    </span>
                  ) : null}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(p.id)}
                aria-label={`Remove ${p.suggestedName}`}
                className="min-h-[36px] shrink-0 rounded-lg px-2 text-sm text-slate/50 hover:bg-slate/5 hover:text-slate"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {available.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="pairing-relationship">
            How they go together
          </label>
          <select
            id="pairing-relationship"
            value={relationship}
            onChange={e => setRelationship(e.target.value as PairingRelationship)}
            className="min-h-[40px] rounded-lg border border-umber-soft/40 bg-white px-2.5 text-[13px] text-slate"
          >
            {PAIRING_RELATIONSHIPS.map(r => (
              <option key={r} value={r}>
                {pairingAdminLabel(r)}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="pairing-item">
            Which dish
          </label>
          <select
            id="pairing-item"
            value={choice}
            onChange={e => setChoice(e.target.value)}
            className="min-h-[40px] min-w-[150px] flex-1 rounded-lg border border-umber-soft/40 bg-white px-2.5 text-[13px] text-slate"
          >
            <option value="">Choose a dish…</option>
            {available.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? "" : " (off the menu)"}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void add()}
            disabled={!choice || busy}
            className="min-h-[40px] rounded-lg bg-slate px-4 text-[13px] font-medium text-oat disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-slate/45">
          {candidates.length <= 1
            ? "Add another dish to the menu and you can pair them."
            : "Everything else on the menu is already paired with this."}
        </p>
      )}

      {choice ? (
        <p className="mt-2 text-[12px] text-slate/55">
          Guests will read: <span className="text-slate">{pairingLabel(relationship)}</span>{" "}
          {available.find(c => c.id === choice)?.name}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-clay-deep">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Heading() {
  return (
    <span className="text-[11px] uppercase tracking-[0.16em] text-umber">
      Goes well with
    </span>
  );
}

function messageFor(code: unknown): string {
  switch (code) {
    case "ALREADY_PAIRED":
      return "You've already paired those two.";
    case "SELF_PAIRING":
      return "A dish can't be paired with itself.";
    case "INVALID_SUGGESTION":
      return "That dish isn't on this venue's menu.";
    default:
      return "Couldn't save that pairing";
  }
}
