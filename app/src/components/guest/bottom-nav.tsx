"use client";

/**
 * The guest's persistent bottom navigation.
 *
 * Five slots, with the service control raised out of the middle. That
 * shape isn't decoration: calling your server is the one thing TabCall
 * exists to make easy, and burying it in a row of equal-weight tabs would
 * make the product's whole reason for being the fourth-most prominent
 * thing on the screen. So it sits proud of the bar, in Saffron, and names
 * the actual person where the table has one — "Call Sarah" rather than
 * "Service", because asking a named person is a different act from
 * operating a machine.
 *
 * This replaced a sticky top tab strip. Top tabs are a desktop pattern
 * that survived onto a surface opened one-handed, holding a drink, at a
 * table — the thumb reaches the bottom of a phone and not the top of it.
 *
 * Tabs, not routes, because everything behind them arrived in the same
 * server pass. Switching is instant on venue wifi and costs no request.
 */

import type { ReactNode } from "react";

export type GuestNavId = "for-you" | "menu" | "picks" | "more";

export type GuestNavItem = {
  id: GuestNavId;
  label: string;
  icon: ReactNode;
  /** Rendered as a small count on the tab. Omitted when zero. */
  badge?: number;
};

export function BottomGuestNav({
  items,
  active,
  onSelect,
  onService,
  serverName,
  serviceEnabled,
  /** Pulses the service button while a request of theirs is open. */
  serviceActive = false,
  accent,
  accentOn,
}: {
  items: GuestNavItem[];
  active: GuestNavId;
  onSelect: (id: GuestNavId) => void;
  onService: () => void;
  /** Null when the table has no assigned server. */
  serverName: string | null;
  /** False when the venue has switched service requests off entirely. */
  serviceEnabled: boolean;
  serviceActive?: boolean;
  /** The venue's own colour, so the raised button is theirs, not ours. */
  accent: string;
  accentOn: string;
}) {
  // First name only. "Call Sarah Okonkwo" doesn't fit the button and
  // isn't how anyone would say it out loud.
  const serviceLabel = serverName ? `Call ${serverName}` : "Service";

  // Split the tabs either side of the raised control. With service off
  // there's no raised control, so they close up into one even row.
  const left = serviceEnabled ? items.slice(0, 2) : items;
  const right = serviceEnabled ? items.slice(2) : [];

  return (
    <nav
      aria-label="Guest sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-plum-soft/40 bg-plum pb-[env(safe-area-inset-bottom)] text-ivory"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {left.map(item => (
          <NavTab
            key={item.id}
            item={item}
            active={active === item.id}
            onSelect={onSelect}
            accent={accent}
          />
        ))}

        {serviceEnabled ? (
          <li className="relative flex w-[22%] shrink-0 justify-center">
            {/* Raised out of the bar. The negative margin is what makes it
                read as the primary action rather than a fifth tab. */}
            <button
              type="button"
              onClick={onService}
              className="-mt-6 flex flex-col items-center gap-1 px-1 pb-2"
            >
              <span
                className={[
                  "flex h-14 w-14 items-center justify-center rounded-full shadow-lift ring-4 ring-plum transition-transform",
                  "active:scale-95 motion-reduce:transition-none",
                  serviceActive ? "animate-pulse motion-reduce:animate-none" : "",
                ].join(" ")}
                style={{ background: accent, color: accentOn }}
              >
                <BellIcon />
              </span>
              <span className="max-w-[76px] truncate text-[10px] font-semibold leading-tight text-ivory">
                {serviceLabel}
              </span>
            </button>
          </li>
        ) : null}

        {right.map(item => (
          <NavTab
            key={item.id}
            item={item}
            active={active === item.id}
            onSelect={onSelect}
            accent={accent}
          />
        ))}
      </ul>
    </nav>
  );
}

function NavTab({
  item,
  active,
  onSelect,
  accent,
}: {
  item: GuestNavItem;
  active: boolean;
  onSelect: (id: GuestNavId) => void;
  accent: string;
}) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={active ? "page" : undefined}
        // 56px tall: comfortably past the 44px minimum, on a control
        // people press with a thumb while holding something else.
        className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 py-2 transition-colors"
      >
        <span className="relative">
          <span
            aria-hidden
            className="block transition-transform motion-reduce:transition-none"
            style={{ color: active ? accent : undefined }}
          >
            {item.icon}
          </span>
          {item.badge && item.badge > 0 ? (
            <span
              className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-plum"
              style={{ background: accent }}
            >
              {item.badge > 9 ? "9+" : item.badge}
            </span>
          ) : null}
        </span>
        <span
          className={[
            "text-[10px] leading-tight",
            active ? "font-semibold" : "font-normal text-ivory/65",
          ].join(" ")}
          style={active ? { color: accent } : undefined}
        >
          {item.label}
        </span>
        {/* Active state is carried by weight and a dot as well as colour,
            so it survives a colour-blind reading of the bar. */}
        <span
          aria-hidden
          className={["h-1 w-1 rounded-full", active ? "" : "opacity-0"].join(" ")}
          style={{ background: accent }}
        />
      </button>
    </li>
  );
}

/* ------------------------------- icons --------------------------------
 * Inline, stroked, 22px. Hand-drawn rather than pulled from an icon set:
 * five icons don't justify a dependency that ships hundreds on a page
 * opened over restaurant wifi.
 * --------------------------------------------------------------------- */

const svg = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SparkIcon() {
  return (
    <svg {...svg}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg {...svg}>
      <path d="M4 4v9a3 3 0 003 3h0V4" />
      <path d="M7 16v4" />
      <path d="M14 4c-1 2-1 5 0 7h3V4" />
      <path d="M17 11v9" />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg {...svg}>
      <path d="M12 20s-6.5-4.2-8.4-8A4.6 4.6 0 0112 6.6 4.6 4.6 0 0120.4 12c-1.9 3.8-8.4 8-8.4 8z" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg {...svg}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg {...svg} width={24} height={24} strokeWidth={1.9}>
      <path d="M4 17h16a1 1 0 00.9-1.4C19.9 13.3 19 11.3 19 9a7 7 0 10-14 0c0 2.3-.9 4.3-1.9 6.6A1 1 0 004 17z" />
      <path d="M10 20.5a2.2 2.2 0 004 0" />
    </svg>
  );
}
