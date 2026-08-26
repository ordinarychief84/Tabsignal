"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * SaaS-standard sidebar shell: dark left rail (brand slate) with grouped
 * nav + active highlighting, a top bar carrying the page's breadcrumb
 * and account actions, and a cream content canvas. Collapses to a top
 * drawer on mobile. Shared by the operator console and venue dashboard.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Exact-match highlighting (for a section root like the dashboard). */
  exact?: boolean;
  badge?: string;
  /** Dim + show a lock affordance for plan-gated items. */
  locked?: string | null;
};

export type NavGroup = { heading?: string; items: NavItem[] };

export function AdminShell({
  brand,
  roleLabel,
  context,
  navTop,
  groups,
  account,
  children,
}: {
  brand: { href: string; name: string };
  roleLabel?: string;
  /** Optional context under the brand (e.g. the venue name + plan). */
  context?: { label: string; sublabel?: string };
  /** Optional element pinned above the nav groups (e.g. a trial nudge). */
  navTop?: ReactNode;
  groups: NavGroup[];
  account: { email: string; changePasswordHref?: string };
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-ivory text-plum">
      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-[248px] flex-col border-r border-plum-soft bg-plum text-ivory",
          "hidden md:flex",
          open ? "!flex" : "",
        ].join(" ")}
      >
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Link href={brand.href} className="inline-flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-plum ring-1 ring-ivory/15">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F4C95D" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F4C95D" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-ivory">{brand.name}</span>
          </Link>
          {roleLabel ? (
            <span className="ml-auto rounded-full bg-ivory/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-ivory/80">
              {roleLabel}
            </span>
          ) : null}
        </div>

        {context ? (
          <div className="mx-3 mb-1 rounded-lg bg-ivory/[0.06] px-3 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ivory/40">Venue</p>
            <p className="truncate text-[13px] font-medium text-ivory">{context.label}</p>
            {context.sublabel ? <p className="mt-0.5 text-[11px] text-ivory/50">{context.sublabel}</p> : null}
          </div>
        ) : null}

        {navTop ? <div className="px-3 pt-2">{navTop}</div> : null}

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {groups.map((group, gi) => (
            <div key={group.heading ?? gi}>
              {group.heading ? (
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ivory/40">
                  {group.heading}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map(it => (
                  <SidebarLink key={it.href} item={it} onNavigate={() => setOpen(false)} />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-ivory/10 px-4 py-3">
          <p className="truncate font-mono text-[11px] text-ivory/50">{account.email}</p>
          <div className="mt-2 flex items-center gap-2">
            {account.changePasswordHref ? (
              <Link
                href={account.changePasswordHref}
                className="rounded-md px-2 py-1 text-[11px] text-ivory/70 hover:bg-ivory/10 hover:text-ivory"
              >
                Password
              </Link>
            ) : null}
            <form action="/api/auth/logout" method="post" className="ml-auto">
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-[11px] text-ivory/70 hover:bg-ivory/10 hover:text-ivory"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sandstone bg-surface px-4 md:hidden">
        <Link href={brand.href} className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F4C95D" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="12" cy="16" r="2" fill="#F4C95D" />
            </svg>
          </span>
          <span className="text-sm font-semibold">{brand.name}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle navigation"
          className="rounded-lg border border-slate/15 px-3 py-1.5 text-sm text-slate"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {/* Backdrop when the mobile drawer is open */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-slate/40 md:hidden"
        />
      ) : null}

      {/* Content */}
      <div className="md:pl-[248px]">
        <main className="mx-auto max-w-6xl px-5 py-8 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/");
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors",
          // §18: a muted Saffron wash marks the current page. The label
          // stays ivory — bright yellow text on every item is exactly what
          // the brief warns against.
          active
            ? "bg-saffron/15 font-medium text-ivory"
            : "text-ivory/65 hover:bg-ivory/5 hover:text-ivory",
          item.locked ? "opacity-55" : "",
        ].join(" ")}
      >
        {active ? (
          <span className="-ml-1 h-4 w-0.5 rounded-full bg-saffron" aria-hidden />
        ) : (
          <span className="-ml-1 w-0.5" aria-hidden />
        )}
        <span className="truncate">{item.label}</span>
        {item.badge ? (
          <span className="ml-auto rounded-full bg-mint px-1.5 py-0.5 text-[9px] font-semibold text-mint-deep">
            {item.badge}
          </span>
        ) : null}
        {item.locked ? (
          <span className="ml-auto rounded-full bg-ivory/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ivory/60">
            {item.locked}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
