"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ slug, operator }: { slug: string; operator: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: `/admin/v/${slug}`,           label: "Dashboard"  },
    { href: `/admin/v/${slug}/analytics`, label: "Analytics"  },
    { href: `/admin/v/${slug}/menu`,      label: "Menu"       },
    { href: `/admin/v/${slug}/reviews`,   label: "Reviews"    },
    { href: `/admin/v/${slug}/staff`,     label: "Staff"      },
    { href: `/admin/v/${slug}/tips`,      label: "Tips"       },
    { href: `/admin/v/${slug}/qr-tents`,  label: "QR tents"   },
    { href: `/admin/v/${slug}/settings`,  label: "Settings"   },
  ];

  function isActive(href: string) {
    if (href === `/admin/v/${slug}`) return pathname === href;
    return pathname?.startsWith(href);
  }

  return (
    <nav className="border-t border-slate/10 px-2 py-2 md:border-t-0 md:px-3 md:py-2">
      <ul className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
        {items.map(it => {
          const active = isActive(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={[
                  "block whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors md:px-3",
                  active
                    ? "bg-slate text-oat"
                    : "text-slate/70 hover:bg-slate/5 hover:text-slate",
                ].join(" ")}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
        {operator ? (
          <li>
            <Link
              href="/operator"
              className="block whitespace-nowrap rounded-lg px-4 py-2 text-sm text-umber hover:bg-slate/5 md:px-3"
            >
              Operator console ↗
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
