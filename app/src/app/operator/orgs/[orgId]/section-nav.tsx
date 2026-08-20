"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tabs across an org's operator pages, plus a switcher to any other org
 * the caller can reach.
 *
 * Client-side only so the current tab can be marked from the pathname —
 * the old sidebar had no active state at all, which is why every page
 * under an org looked identical apart from its body.
 */

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "/venues", label: "Venues" },
  { seg: "/billing", label: "Plan" },
  { seg: "/members", label: "Members" },
  { seg: "/broadcast", label: "Broadcast" },
];

export function OrgSectionNav({
  orgId,
  others,
}: {
  orgId: string;
  others: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const base = `/operator/orgs/${orgId}`;

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-umber-soft/30 pb-px">
      {TABS.map(t => {
        const href = `${base}${t.seg}`;
        const active = t.seg === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-slate font-medium text-slate"
                : "border-transparent text-slate/55 hover:text-slate",
            ].join(" ")}
          >
            {t.label}
          </Link>
        );
      })}

      {others.length > 0 ? (
        <details className="relative ml-auto pb-2">
          <summary className="cursor-pointer list-none rounded-lg border border-slate/15 px-3 py-1.5 text-[12px] text-slate/70 hover:text-slate">
            Switch org
          </summary>
          <ul className="absolute right-0 z-10 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-umber-soft/40 bg-white py-1 shadow-card">
            {others.map(o => (
              <li key={o.id}>
                <Link
                  href={`/operator/orgs/${o.id}`}
                  className="block truncate px-3 py-2 text-[13px] text-slate/75 hover:bg-slate/5 hover:text-slate"
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
