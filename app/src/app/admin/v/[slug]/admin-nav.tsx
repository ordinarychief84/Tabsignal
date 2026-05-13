"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({
  slug,
  operator,
  isPaidPlan,
  isProPlan,
}: {
  slug: string;
  operator: boolean;
  isPaidPlan: boolean;
  isProPlan: boolean;
}) {
  const pathname = usePathname();
  const items: { href: string; label: string; growth?: boolean; pro?: boolean }[] = [
    { href: `/admin/v/${slug}`,             label: "Dashboard"  },
    { href: `/admin/v/${slug}/requests`,    label: "Live requests" },
    // Guest Commerce Module (v2). Slotted right after Live requests so a
    // manager can pivot from "who's calling" to "what they ordered" in one
    // glance. Free-tier — no plan lock badge.
    { href: `/admin/v/${slug}/orders`,      label: "Orders"     },
    { href: `/admin/v/${slug}/bills`,       label: "Bills"      },
    { href: `/admin/v/${slug}/analytics`,   label: "Analytics", growth: true },
    { href: `/admin/v/${slug}/menu`,        label: "Menu",      growth: true },
    { href: `/admin/v/${slug}/specials`,    label: "Specials"   },
    { href: `/admin/v/${slug}/promotions`,  label: "Promotions" },
    { href: `/admin/v/${slug}/reservations`, label: "Reservations", pro: true },
    { href: `/admin/v/${slug}/regulars`,    label: "Regulars",  pro: true },
    { href: `/admin/v/${slug}/reviews`,     label: "Reviews"    },
    { href: `/admin/v/${slug}/staff`,       label: "People"     },
    { href: `/admin/v/${slug}/audit`,       label: "Audit log"  },
    { href: `/admin/v/${slug}/tips`,        label: "Tips",      growth: true },
    { href: `/admin/v/${slug}/tables`,      label: "Tables"     },
    { href: `/admin/v/${slug}/pos`,         label: "POS"        },
    { href: `/admin/v/${slug}/qr-tents`,    label: "QR tents"   },
    { href: `/admin/v/${slug}/billing`,     label: "Billing"    },
    { href: `/admin/v/${slug}/settings`,    label: "Settings"   },
    { href: `/admin/v/${slug}/branding`,    label: "Branding"   },
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
          const lockedGrowth = it.growth && !isPaidPlan;
          const lockedPro = it.pro && !isProPlan;
          const lockLabel = lockedPro ? "Pro" : lockedGrowth ? "Growth" : null;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={[
                  "flex items-center justify-between whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors md:px-3",
                  active
                    ? "bg-slate text-oat"
                    : "text-slate/70 hover:bg-slate/5 hover:text-slate",
                ].join(" ")}
              >
                <span>{it.label}</span>
                {lockLabel ? (
                  <span className={[
                    "ml-2 rounded-full px-1.5 text-[9px] uppercase tracking-wider",
                    active ? "bg-oat/20 text-oat" : "bg-slate/10 text-slate/50",
                  ].join(" ")}>
                    {lockLabel}
                  </span>
                ) : null}
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
