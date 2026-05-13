import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";

/**
 * Shared marketing-page chrome (nav + footer + brand logo). Used by:
 *   /                  landing
 *   /features          list
 *   /features/[slug]   detail
 *   /pricing           pricing
 *   /how-it-works      about
 *
 * Styled to match the design-mockup palette (brand-lime accent, dark
 * primary-deep ink, soft cream surfaces). Material Symbols Outlined font
 * is loaded once in app/layout.tsx.
 */

/* ---------------------------------------------------------------------- */
/* Logo                                                                   */
/* ---------------------------------------------------------------------- */

/**
 * TabCall brand mark. The icon is the signal arc + dot enclosed in a
 * rounded Deep Ink tile — the same mark used across admin, staff,
 * /comp, /signup, /terms and the magic-link emails. Restored here after
 * a short detour using a Material `restaurant` glyph.
 */
export function Logo({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const wordColor = variant === "light" ? "#FFFFFF" : "#0d0b19";
  return (
    <Link href="/" aria-label="TabCall home" className="inline-flex items-center gap-2 leading-none">
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
      <span className="text-2xl font-bold tracking-tight" style={{ color: wordColor }}>
        TabCall
      </span>
    </Link>
  );
}

/* ---------------------------------------------------------------------- */
/* Navbar                                                                 */
/* ---------------------------------------------------------------------- */

export function MarketingNav() {
  return (
    <header className="fixed top-0 z-50 w-full bg-surface-warm/80 shadow-sm backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-10">
        <Logo variant="dark" />

        <div className="hidden items-center gap-8 md:flex">
          <Link href="/features" className="font-medium text-on-surface-variant transition-colors hover:text-primary-deep">
            Features
          </Link>
          <Link href="/how-it-works" className="font-medium text-on-surface-variant transition-colors hover:text-primary-deep">
            How It Works
          </Link>
          <Link href="/pricing" className="font-medium text-on-surface-variant transition-colors hover:text-primary-deep">
            Pricing
          </Link>
          <Link href="/features" className="font-medium text-on-surface-variant transition-colors hover:text-primary-deep">
            Resources
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/staff/login"
            className="hidden font-semibold text-primary-deep transition-opacity hover:opacity-80 sm:inline-block"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary-deep px-5 py-2.5 font-semibold text-white transition-all hover:opacity-90 active:scale-95 md:px-6 md:py-3"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/* Footer                                                                 */
/* ---------------------------------------------------------------------- */

const PRODUCT_LINKS = [
  { label: "Digital Menu", href: "/features/digital-menu" },
  { label: "Order Management", href: "/features/qr-orders" },
  { label: "Analytics Floor", href: "/features/analytics" },
  { label: "Integrations", href: "/features/pos-integration" },
];

const COMPANY_LINKS = [
  { label: "About Us", href: "/how-it-works" },
  { label: "Careers", href: "#" },
  { label: "Success Stories", href: "#" },
  { label: "Privacy Policy", href: "/terms" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-outline-variant/40 bg-surface-container-lowest">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20">
        <div className="mb-16 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          <div className="space-y-6 lg:col-span-2">
            <Logo variant="dark" />
            <p className="max-w-xs text-[14px] leading-relaxed text-on-surface-variant">
              Operationally smart hospitality. We build the tools that help
              modern venues thrive in a digital-first world.
            </p>
            <div className="flex gap-3">
              <SocialIcon label="Share" icon="share" />
              <SocialIcon label="Website" icon="public" />
              <SocialIcon label="Email" icon="mail" />
            </div>
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />

          <div className="space-y-5">
            <h5 className="font-bold text-primary-deep">Join our Newsletter</h5>
            <p className="text-sm text-on-surface-variant">
              Stay updated with the latest in hospitality tech and trends.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-6 border-t border-outline-variant/40 pt-10 md:flex-row">
          <p className="text-sm text-on-surface-variant">
            © {new Date().getFullYear()} TabCall. Operationally smart hospitality.
          </p>
          <div className="flex gap-8 text-sm text-on-surface-variant">
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
            <a href="#" className="hover:underline">Security</a>
            <a href="#" className="hover:underline">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="space-y-5">
      <h5 className="font-bold text-primary-deep">{title}</h5>
      <ul className="space-y-3.5 text-on-surface-variant">
        {links.map((l) => (
          <li key={l.label}>
            {l.href.startsWith("/") ? (
              <Link href={l.href} className="transition-colors hover:text-primary-deep">
                {l.label}
              </Link>
            ) : (
              <a href={l.href} className="transition-colors hover:text-primary-deep">
                {l.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialIcon({ label, icon }: { label: string; icon: string }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-low text-primary-deep transition-colors hover:bg-brand-lime"
    >
      <span aria-hidden className="material-symbols-outlined text-xl">{icon}</span>
    </a>
  );
}
