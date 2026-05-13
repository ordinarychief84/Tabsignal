import Link from "next/link";
import { FEATURES, PRIMARY_FEATURE_SLUGS } from "@/lib/features-data";
import { NewsletterForm } from "./newsletter-form";

/**
 * Shared marketing-page chrome: brand logo, top navbar (with the Features +
 * Resources dropdowns), and the footer. Used by the landing page, the
 * /features list, /features/[slug] detail pages, and /how-it-works.
 *
 * Keeping these in one place means a copy or layout tweak lands on every
 * marketing page at once — no drift between landing and the feature pages.
 */

/* ---------------------------------------------------------------------- */
/* Logo                                                                   */
/* ---------------------------------------------------------------------- */

export function Logo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const wordColor = variant === "light" ? "#FFFFFF" : "#232130";
  return (
    <span className="inline-flex items-center gap-2 leading-none" aria-label="TabCall">
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M 6 11 Q 12 6, 18 11"
            fill="none"
            stroke="#F2E7B7"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
        </svg>
      </span>
      <span
        className="text-lg font-semibold tracking-tight"
        style={{ color: wordColor }}
      >
        TabCall
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Navbar — Features dropdown lists the six product features; Resources    */
/* dropdown lists static resource links.                                  */
/* ---------------------------------------------------------------------- */

const RESOURCE_LINKS = [
  { label: "Blog", href: "#" },
  { label: "Help Center", href: "#" },
  { label: "Guides", href: "#" },
  { label: "Videos", href: "#" },
  { label: "Careers", href: "#" },
];

function FeaturesDropdown() {
  const items = PRIMARY_FEATURE_SLUGS.map((slug) =>
    FEATURES.find((f) => f.slug === slug)!
  );
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className="inline-flex items-center gap-1 text-sm text-slate/75 transition-colors hover:text-slate focus:text-slate focus:outline-none"
      >
        Features
        <Chevron />
      </button>
      <HoverBridge />
      <div
        role="menu"
        className="invisible absolute left-1/2 top-[calc(100%+0.5rem)] z-40 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1 rounded-2xl bg-white p-3 opacity-0 shadow-lift ring-1 ring-umber-soft/30 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {items.map((f) => (
            <li key={f.slug}>
              <Link
                href={`/features/${f.slug}`}
                role="menuitem"
                className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-oat"
              >
                <span
                  aria-hidden
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate ${
                    f.tone === "butter" ? "bg-chartreuse/55" : "bg-sea-soft/70"
                  }`}
                >
                  <NavFeatureIcon slug={f.slug} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate">{f.title}</span>
                  <span className="line-clamp-2 text-[11px] leading-snug text-slate/65">{f.tagline}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-umber-soft/30 pt-2">
          <Link
            href="/features"
            className="flex items-center justify-between rounded-xl px-3 py-2 text-[12px] font-medium text-slate hover:bg-oat"
          >
            See all features
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ResourcesDropdown() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className="inline-flex items-center gap-1 text-sm text-slate/75 transition-colors hover:text-slate focus:text-slate focus:outline-none"
      >
        Resources
        <Chevron />
      </button>
      <HoverBridge />
      <div
        role="menu"
        className="invisible absolute right-0 top-[calc(100%+0.5rem)] z-40 w-56 -translate-y-1 rounded-2xl bg-white p-2 opacity-0 shadow-lift ring-1 ring-umber-soft/30 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {RESOURCE_LINKS.map((r) => (
          <a
            key={r.label}
            href={r.href}
            role="menuitem"
            className="block rounded-lg px-3 py-2 text-sm text-slate/80 hover:bg-oat hover:text-slate"
          >
            {r.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 12 12"
      className="transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
    >
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HoverBridge() {
  // Invisible bridge under the trigger that keeps the dropdown open when
  // the cursor moves down toward the menu.
  return (
    <div
      aria-hidden
      className="pointer-events-none invisible absolute left-0 right-0 top-full h-3 group-hover:pointer-events-auto group-hover:visible group-focus-within:pointer-events-auto group-focus-within:visible"
    />
  );
}

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-umber-soft/30 bg-oat/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="TabCall home">
          <Logo variant="dark" />
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-slate/75 md:flex">
          <FeaturesDropdown />
          <Link href="/how-it-works" className="hover:text-slate">
            How It Works
          </Link>
          <Link href="/pricing" className="hover:text-slate">
            Pricing
          </Link>
          <ResourcesDropdown />
        </nav>

        <div className="flex items-center gap-3 md:gap-5">
          <Link
            href="/staff/login"
            className="hidden text-sm text-slate/75 hover:text-slate md:inline-block"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-chartreuse px-4 py-2 text-sm font-semibold text-slate shadow-soft transition-colors hover:bg-chartreuse/85 md:px-5"
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/* Footer                                                                 */
/* ---------------------------------------------------------------------- */

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
      { label: "Integrations", href: "/features/pos-integration" },
      { label: "Updates", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "#" },
      { label: "Help Center", href: "#" },
      { label: "Guides", href: "#" },
      { label: "Videos", href: "#" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "#" },
      { label: "Contact Us", href: "mailto:hello@tab-call.com" },
      { label: "Privacy Policy", href: "/terms" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-umber-soft/40 bg-oat">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr] md:gap-8 md:px-8 md:py-16">
        <div>
          <Logo variant="dark" />
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-slate/65">
            The all-in-one hospitality platform for restaurants, bars,
            lounges, and cafés.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <SocialIcon label="Facebook"><FacebookIcon /></SocialIcon>
            <SocialIcon label="Instagram"><InstagramIcon /></SocialIcon>
            <SocialIcon label="LinkedIn"><LinkedInIcon /></SocialIcon>
          </div>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-umber">
              {col.title}
            </p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("/") ? (
                    <Link
                      href={l.href}
                      className="text-[13px] text-slate/70 hover:text-slate"
                    >
                      {l.label}
                    </Link>
                  ) : (
                    <a
                      href={l.href}
                      className="text-[13px] text-slate/70 hover:text-slate"
                    >
                      {l.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-umber">
            Stay in the loop
          </p>
          <p className="mt-4 text-[13px] leading-relaxed text-slate/65">
            Get the latest updates, tips, and insights for modern hospitality.
          </p>
          <NewsletterForm />
        </div>
      </div>

      <div className="border-t border-umber-soft/30">
        <div className="mx-auto max-w-7xl px-5 py-6 text-center text-[12px] text-slate/55 md:px-8">
          © {new Date().getFullYear()} TabCall. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate ring-1 ring-umber-soft/40 hover:bg-oat"
    >
      {children}
    </a>
  );
}

function FacebookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 22v-9h3l1-4h-4V6.5c0-1 .3-1.7 1.7-1.7H17V1.4C16.6 1.3 15.4 1.2 14 1.2c-3 0-5 1.8-5 5.1V9H6v4h3v9h4z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 24h5V8H0v16zm7.5-16v16h5v-8.4c0-2.2.4-4.3 3.1-4.3 2.7 0 2.7 2.5 2.7 4.5V24h5V13c0-5-1.1-8.6-6.4-8.6-2.6 0-4.3 1.4-5 2.7H12V8H7.5z" />
    </svg>
  );
}

/* Smaller version of the icon set, used inside the Features dropdown so the
   menu rows stay compact. */
function NavFeatureIcon({ slug }: { slug: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (slug) {
    case "qr-payments":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="13" height="11" rx="2" />
          <path d="M3 9h13" />
          <rect x="9" y="11" width="12" height="9" rx="2" />
        </svg>
      );
    case "qr-orders":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "digital-menu":
      return (
        <svg {...common}>
          <circle cx="13.5" cy="6.5" r="2.5" />
          <path d="M5 11h11M5 15h7M5 19h13" />
        </svg>
      );
    case "wishlist":
      return (
        <svg {...common}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "promotions":
      return (
        <svg {...common}>
          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        </svg>
      );
    case "pos-integration":
      return (
        <svg {...common}>
          <path d="M7 8H4l3-4M17 16h3l-3 4M4 8h12M20 16H8" />
        </svg>
      );
    default:
      return null;
  }
}
