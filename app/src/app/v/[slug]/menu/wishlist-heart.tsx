"use client";

import { useEffect, useState } from "react";

/**
 * Small client subcomponent rendered next to each menu item. Two states:
 *   - "saved" — the item is on the wishlist (filled heart, tap to remove)
 *   - "unsaved" — tap to POST to /wishlist
 *
 * The parent (a separate <WishlistHeartProvider />) pre-fetches the
 * wishlist on mount and seeds initial state via context so we don't fire
 * N requests for N items. To keep things self-contained without a
 * context here, we accept `savedInit` as a prop and let the parent
 * batch the lookup at the page boundary.
 */
export function WishlistHeart({
  slug,
  menuItemId,
  sessionId,
  sessionToken,
  savedInit,
}: {
  slug: string;
  menuItemId: string;
  sessionId: string;
  sessionToken: string;
  savedInit: boolean;
}) {
  const [saved, setSaved] = useState(savedInit);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSaved(savedInit); }, [savedInit]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (saved) {
        const res = await fetch(`/api/v/${slug}/wishlist`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, sessionToken, menuItemId }),
        });
        if (res.ok) setSaved(false);
      } else {
        const res = await fetch(`/api/v/${slug}/wishlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, sessionToken, menuItemId, quantity: 1 }),
        });
        if (res.ok) setSaved(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={saved}
      className={[
        "ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
        saved
          ? "border-coral/50 bg-coral/15 text-coral"
          : "border-slate/15 bg-white text-slate/40 hover:border-coral/40 hover:text-coral",
      ].join(" ")}
    >
      <span aria-hidden className="text-base leading-none">{saved ? "♥" : "♡"}</span>
    </button>
  );
}
