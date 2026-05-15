"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS: { label: string; href: string }[] = [
  { label: "Features", href: "/features" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/features" },
];

/**
 * Mobile-only hamburger + full-screen drawer for the marketing chrome.
 *
 * On md+ the desktop nav owns its own visible link row; this component
 * is gated by `md:hidden` so it appears only on small viewports. The
 * drawer opens flush with the top bar, locks body scroll, and closes
 * on link tap, ESC, and a backdrop click.
 */
export function MarketingMobileNav() {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the drawer is open. Without this, iOS Safari
  // would still scroll the page under the drawer when the user dragged.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape — keyboard users + browsers with a hardware back.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-primary-deep hover:bg-surface-container-low"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          {open ? (
            <>
              <path d="M5 5l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M17 5L5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path d="M3 6h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 11h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {/* Backdrop + drawer panel. Both are inside the same container so the
          backdrop sits behind the panel in stacking order. */}
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-16 z-40 bg-primary-deep/40 backdrop-blur-sm"
          />
          <div className="fixed inset-x-0 top-16 z-40 bg-surface-warm shadow-lift">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
              {LINKS.map(l => (
                <Link
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-base font-medium text-primary-deep hover:bg-surface-container-low"
                >
                  {l.label}
                </Link>
              ))}
              <hr className="my-3 border-outline-variant/40" />
              <Link
                href="/staff/login"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-medium text-on-surface-variant hover:bg-surface-container-low"
              >
                Login
              </Link>
              <Link
                href="/admin/login"
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-base font-medium text-on-surface-variant hover:bg-surface-container-low"
              >
                Admin sign-in
              </Link>
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}
