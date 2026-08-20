"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Destructive-action button with a real confirmation step.
 *
 * Replaces two patterns that were both wrong in different ways:
 *
 *   1. `window.confirm` — unstyleable, blocks the main thread, and reads
 *      as a browser artefact rather than part of the product.
 *   2. Nothing at all — deleting a note on a regular's dossier fired on
 *      the first click with no way back.
 *
 * Uses the native `<dialog>` element on purpose: focus trapping, Esc to
 * dismiss, inertness of the page behind, and the top layer all come from
 * the platform rather than several hundred lines of our own. `showModal()`
 * needs a client effect, hence the ref rather than an `open` attribute.
 *
 * Focus lands on Cancel — the dialog's first focusable control — which is
 * the right default for a destructive action: someone who taps the trigger
 * and then hits Enter out of habit cancels rather than deletes. Esc and a
 * backdrop click do the same.
 */
export function ConfirmButton({
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  children,
  className,
  disabled = false,
}: {
  onConfirm: () => void | Promise<void>;
  /** What is about to happen, named specifically — never "Are you sure?" */
  title: string;
  /** The consequence, especially anything irreversible. */
  body?: string;
  confirmLabel?: string;
  /** The trigger's own label. */
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Clicking the backdrop closes. The dialog element itself fills the
  // whole top layer, so a click whose target IS the dialog (rather than
  // the panel inside it) landed on the backdrop.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function onClick(e: MouseEvent) {
      if (e.target === el) close();
    }
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [close]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => dialogRef.current?.showModal()}
        className={
          className ??
          "rounded-lg border border-coral/30 px-3 py-1.5 text-[13px] font-medium text-coral transition-colors hover:bg-coral/10 disabled:opacity-50"
        }
      >
        {children}
      </button>

      <dialog
        ref={dialogRef}
        className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-slate/10 bg-white p-0 text-slate shadow-xl backdrop:bg-slate/40 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {body ? <p className="mt-2 text-sm leading-relaxed text-slate/65">{body}</p> : null}
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate/60 transition-colors hover:text-slate disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="rounded-lg bg-coral px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
