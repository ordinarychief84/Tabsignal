import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared SaaS-admin UI primitives for the operator console and venue
 * dashboard. Server-safe (no client hooks). One visual language: cream
 * canvas, white cards, hairline slate borders, chartreuse accent.
 */

/* ------------------------------- PageHeader ---------------------------- */

export function PageHeader({
  eyebrow,
  backHref,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  /**
   * Turns the eyebrow into the page's way back out.
   *
   * Every drill-down already prints the name of the section it came from
   * ("PROMOTIONS" above "New promotion") — it just wasn't a link, so the
   * only exit was the sidebar or the browser's own back button. Passing
   * `backHref` makes that existing label do the job it already looks
   * like it's doing.
   */
  backHref?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const eyebrowClass = "text-[11px] font-semibold uppercase tracking-[0.18em] text-umber";
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && backHref ? (
          <Link
            href={backHref}
            className={`${eyebrowClass} inline-flex items-center gap-1.5 rounded transition-colors hover:text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chartreuse-deep`}
          >
            <span aria-hidden>&larr;</span>
            {eyebrow}
          </Link>
        ) : eyebrow ? (
          <p className={eyebrowClass}>{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate md:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-slate/60">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* -------------------------------- StatCard ----------------------------- */

export function StatCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { dir: "up" | "down" | "flat"; text: string };
}) {
  const trendColor =
    trend?.dir === "up" ? "text-sea" : trend?.dir === "down" ? "text-coral" : "text-slate/45";
  const trendGlyph = trend?.dir === "up" ? "↑" : trend?.dir === "down" ? "↓" : "→";
  return (
    <div className="rounded-2xl border border-slate/10 bg-white px-5 py-4 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate/50">{label}</p>
      <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-slate tabular-nums">
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {trend ? <span className={`text-[11px] font-medium ${trendColor}`}>{trendGlyph} {trend.text}</span> : null}
        {hint ? <span className="text-[11px] text-slate/45">{hint}</span> : null}
      </div>
    </div>
  );
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  const lg = cols === 5 ? "lg:grid-cols-5" : cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return <div className={`grid gap-3 sm:grid-cols-2 ${lg}`}>{children}</div>;
}

/* ---------------------------------- Card ------------------------------- */

export function Panel({
  title,
  action,
  children,
  padded = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-card">
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate/10 px-5 py-3.5">
          {title ? <h2 className="text-sm font-semibold text-slate">{title}</h2> : <span />}
          {action}
        </header>
      ) : null}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/* --------------------------------- Table ------------------------------- */

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate/10 text-[11px] font-semibold uppercase tracking-wider text-slate/45">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate/5">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, right = false }: { children?: ReactNode; right?: boolean }) {
  return <th className={`px-5 py-2.5 font-semibold ${right ? "text-right" : ""}`}>{children}</th>;
}

export function Td({
  children,
  right = false,
  mono = false,
  muted = false,
}: {
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={[
        "px-5 py-3 align-middle",
        right ? "text-right" : "",
        mono ? "font-mono text-[12px]" : "",
        muted ? "text-slate/50" : "text-slate",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

export function Row({ children, href }: { children: ReactNode; href?: string }) {
  const base = "transition-colors hover:bg-oat/60";
  if (!href) return <tr className={base}>{children}</tr>;
  // Whole-row link via a wrapping approach isn't valid HTML inside tbody;
  // callers put a <Td> with the link. This keeps the hover affordance.
  return <tr className={base}>{children}</tr>;
}

/* --------------------------------- Badge ------------------------------- */

type Tone = "neutral" | "green" | "sea" | "amber" | "coral" | "slate";

const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-slate/10 text-slate/70",
  green: "bg-chartreuse/30 text-slate",
  sea: "bg-sea-soft/70 text-slate",
  amber: "bg-[#eee3b3] text-[#6c653e]",
  coral: "bg-coral/15 text-coral",
  slate: "bg-slate text-oat",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------ EmptyState ----------------------------- */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate/15 bg-white/50 px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate/50">{body}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-5 inline-block rounded-full bg-slate px-4 py-2 text-sm font-medium text-oat hover:bg-slate/90"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/* ----------------------------- primary button -------------------------- */

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const cls =
    variant === "primary"
      ? "bg-slate text-oat hover:bg-slate/90"
      : "border border-slate/15 bg-white text-slate hover:border-slate/30";
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${cls}`}>
      {children}
    </Link>
  );
}

/* -------------------------------- skeletons ---------------------------- */

/**
 * Loading placeholders.
 *
 * Every admin page is `force-dynamic`, so navigation waits on a server
 * render — measured at 0.46–0.86s warm and local, and materially worse in
 * production once a Vercel function hop and a Supabase round trip are in
 * the path. Without a `loading.tsx` Next.js holds the *previous* page on
 * screen, frozen, for that whole time: no spinner, no dimming, nothing.
 * Every sidebar click reads as a broken button.
 *
 * These are deliberately shaped like the content they stand in for —
 * a header block, then rows — so the page doesn't visibly reflow when the
 * real thing lands.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-slate/10 ${className}`} />;
}

/** Header + N rows. The default shape of almost every admin page. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-8">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2.5 h-7 w-56" />
        <Skeleton className="mt-2.5 h-4 w-80 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 border-b border-slate/5 px-5 py-4 last:border-b-0"
            // Stagger the pulse so it reads as one surface breathing rather
            // than a row of independently flashing bars.
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
