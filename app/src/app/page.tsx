import Link from "next/link";
import type { Metadata } from "next";
import { NewsletterForm } from "./newsletter-form";

/**
 * TabCall landing page — hospitality SaaS direction (Toast / Resy / Square feel).
 * Structure follows the design mockup:
 *   1. Navbar
 *   2. Hero (Delight guests. Empower staff.)
 *   3. Trusted-by strip
 *   4. Feature grid (6 cards)
 *   5. How TabCall works
 *   6. Metrics strip
 *   7. Testimonials
 *   8. Pricing  (kept because "Pricing" is in the nav)
 *   9. Final CTA
 *  10. Footer
 *
 * Palette is driven by Tailwind tokens (see tailwind.config.ts):
 *   slate  = #232130  Deep Ink
 *   oat    = #F7F5F2  Soft Linen
 *   linen  = #FBFAF7
 *   chartreuse.DEFAULT = #F2E7B7  Warm Butter
 *   sea.soft = #C7D6CF Sage
 *   umber.soft = #B7A39A Clay
 *   coral.DEFAULT = #C8634F  / coral.soft = #E8B8B8 Soft Coral
 */

export const metadata: Metadata = {
  title: "TabCall · all-in-one hospitality platform",
  description:
    "TabCall helps restaurants, bars, lounges, and cafés streamline service, increase revenue, and deliver exceptional guest experiences.",
};

export default function LandingPage() {
  return (
    <main className="bg-oat text-slate">
      <Navbar />
      <Hero />
      <TrustedStrip />
      <FeatureGrid />
      <HowItWorks />
      <Metrics />
      <Testimonials />
      <Pricing />
      <FinalCta />
      <Footer />
    </main>
  );
}

/* ---------------------------------------------------------------------- */
/* Logo                                                                   */
/* ---------------------------------------------------------------------- */

function Logo({ variant = "dark" }: { variant?: "dark" | "light" }) {
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
/* Navbar                                                                 */
/* ---------------------------------------------------------------------- */

const RESOURCES = [
  { label: "Blog", href: "#" },
  { label: "Help Center", href: "#" },
  { label: "Guides", href: "#" },
  { label: "Videos", href: "#" },
  { label: "Careers", href: "#" },
];

function ResourcesDropdown() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className="inline-flex items-center gap-1 text-sm text-slate/75 transition-colors hover:text-slate focus:text-slate focus:outline-none"
      >
        Resources
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 12 12"
          className="transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 right-0 top-full h-3 group-hover:pointer-events-auto group-hover:visible group-focus-within:pointer-events-auto group-focus-within:visible"
      />
      <div
        role="menu"
        className="invisible absolute right-0 top-[calc(100%+0.5rem)] z-40 w-56 -translate-y-1 rounded-2xl bg-white p-2 opacity-0 shadow-lift ring-1 ring-umber-soft/30 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {RESOURCES.map((r) => (
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

function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-umber-soft/30 bg-oat/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="TabCall home">
          <Logo variant="dark" />
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-slate/75 md:flex">
          <a href="#features" className="hover:text-slate">Features</a>
          <a href="#how" className="hover:text-slate">How It Works</a>
          <a href="#pricing" className="hover:text-slate">Pricing</a>
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
/* Hero                                                                   */
/* ---------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-oat">
      {/* Soft hospitality wash — sage radial top-right, butter wash bottom-left.
          Evokes daylit cafe/restaurant without overwhelming the typography. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 85% 15%, rgba(199, 214, 207, 0.45) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(45% 40% at 5% 90%, rgba(242, 231, 183, 0.32) 0%, rgba(247, 245, 242, 0) 65%)",
        }}
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-10 md:grid-cols-[1fr_1fr] md:gap-10 md:px-8 md:pb-24 md:pt-16 lg:gap-16 lg:pb-28 lg:pt-20">
        {/* LEFT: copy column */}
        <div className="animate-fade-up">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-umber">
            All-in-one hospitality platform
          </p>

          <h1 className="mt-5 text-[36px] font-semibold leading-[1.05] tracking-[-0.02em] text-slate md:text-[44px] lg:text-[64px]">
            Delight guests.
            <br />
            Empower staff.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate/65 md:text-lg">
            TabCall helps restaurants, bars, lounges, and cafés streamline
            service, increase revenue, and deliver exceptional guest
            experiences.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-chartreuse px-6 py-3.5 text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:bg-chartreuse/85 hover:shadow-lift"
            >
              Get Started Free
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-umber-soft/50 bg-white px-5 py-3 text-[15px] font-medium text-slate transition-colors hover:border-slate/30"
            >
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-chartreuse/40"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M2 1l5 3.5L2 8V1z" fill="#232130" />
                </svg>
              </span>
              See How It Works
            </a>
          </div>

          {/* Feature shortcuts — three butter tiles + one sage to match mockup. */}
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FeatureShortcut tone="butter" title="Call Waiter" sub="Instant service">
              <BellIcon />
            </FeatureShortcut>
            <FeatureShortcut tone="butter" title="Order" sub="From the table">
              <ForkKnifeIcon />
            </FeatureShortcut>
            <FeatureShortcut tone="butter" title="Pay" sub="Securely">
              <CardIcon />
            </FeatureShortcut>
            <FeatureShortcut tone="sage" title="Review" sub="Share feedback">
              <StarIcon />
            </FeatureShortcut>
          </ul>
        </div>

        {/* RIGHT: visual column with QR tent + phone */}
        <HeroVisual />
      </div>
    </section>
  );
}

function FeatureShortcut({
  tone,
  title,
  sub,
  children,
}: {
  tone: "butter" | "sage";
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const tile =
    tone === "butter"
      ? "bg-chartreuse/55 text-slate"
      : "bg-sea-soft/70 text-slate";
  return (
    <li className="text-left">
      <span
        aria-hidden
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tile}`}
      >
        {children}
      </span>
      <p className="mt-3 text-sm font-semibold text-slate">{title}</p>
      <p className="text-[12px] text-slate/55">{sub}</p>
    </li>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      {/* Soft circular wash behind both mockups, mimics natural light. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-[40px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(199, 214, 207, 0.35) 0%, rgba(247, 245, 242, 0) 75%)",
        }}
      />

      <div className="relative flex items-end justify-center gap-3 md:gap-5">
        <QRTent />
        <PhoneMockup />
      </div>
    </div>
  );
}

function QRTent() {
  // The QR tent is the platform's primary on-site touchpoint — guests see this
  // before they ever see the app. Design rule: the QR is the hero. Everything
  // else (brand, headline, trust copy) plays a supporting role.
  return (
    <div className="relative w-[44%] max-w-[240px] -rotate-1 animate-float-slow md:w-[46%]">
      {/* Soft cast shadow under the tent — suggests a physical card on a real
          restaurant table, not a floating UI element. */}
      <div
        aria-hidden
        className="absolute -bottom-2 left-3 right-3 -z-10 h-4 rounded-full bg-slate/15 blur-md"
      />

      <div className="relative overflow-hidden rounded-[20px] bg-white p-4 shadow-lift ring-1 ring-umber-soft/30">
        {/* Compact brand line — present, but compressed so it doesn't compete
            with the QR. */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate"
            >
              <svg viewBox="0 0 24 24" width="14" height="14">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold tracking-tight text-slate">TabCall</span>
          </span>
          <span className="rounded-full bg-sea-soft/60 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-slate/75">
            Table 12
          </span>
        </div>

        {/* Headline — eyebrow + H1 stacked tight. Reads as a single instruction. */}
        <div className="mt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-umber">
            Scan to
          </p>
          <p className="text-[18px] font-semibold leading-[1.05] tracking-tight text-slate">
            Order &amp; Pay
          </p>
        </div>

        {/* QR centrepiece — sage halo behind, viewfinder brackets at the
            corners, embedded TabCall mark in the centre. */}
        <div className="relative mt-3">
          <div
            aria-hidden
            className="absolute inset-0 -m-2 rounded-2xl"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, rgba(199, 214, 207, 0.45) 0%, rgba(247, 245, 242, 0) 75%)",
            }}
          />
          <div className="relative rounded-xl bg-white p-2 ring-1 ring-umber-soft/30">
            {/* Scan viewfinder brackets — warm butter accents at corners,
                signals "this is the scan target". */}
            <ScanBracket pos="tl" />
            <ScanBracket pos="tr" />
            <ScanBracket pos="bl" />
            <ScanBracket pos="br" />
            <QRCodePattern />
          </div>
        </div>

        {/* Trust line — minimal copy that confirms the action takes seconds. */}
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[9px] font-medium text-slate/55">
          <CameraIcon />
          Point camera · No app needed
        </p>
      </div>
    </div>
  );
}

function ScanBracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const positions: Record<typeof pos, string> = {
    tl: "left-0.5 top-0.5 border-l-2 border-t-2 rounded-tl-md",
    tr: "right-0.5 top-0.5 border-r-2 border-t-2 rounded-tr-md",
    bl: "left-0.5 bottom-0.5 border-l-2 border-b-2 rounded-bl-md",
    br: "right-0.5 bottom-0.5 border-r-2 border-b-2 rounded-br-md",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-chartreuse ${positions[pos]}`}
    />
  );
}

function CameraIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function QRCodePattern() {
  // Decorative QR-like grid. 13x13 modules with three locator squares at
  // corners + a centre knockout where the TabCall mark sits embedded — same
  // pattern Square / Apple / many hospitality QRs use to signal "this is
  // OUR QR, not a generic one".
  const SIZE = 13;
  const CENTER_RADIUS = 1.5; // modules cleared around centre for the brand knockout
  const modules: boolean[][] = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      // Three corner locators — TL, TR, BL — each 3x3 with a 1-module ring.
      const inLocator =
        (y < 3 && (x < 3 || x > SIZE - 4)) || (y > SIZE - 4 && x < 3);
      if (inLocator) {
        const ly = y < 3 ? y : y - (SIZE - 3);
        const lx = x < 3 ? x : x > SIZE - 4 ? x - (SIZE - 3) : x;
        if (ly === 1 && lx === 1) return true; // solid core
        return ly === 0 || ly === 2 || lx === 0 || lx === 2; // outer ring
      }
      // Centre knockout — leave a small square in the middle empty so the
      // embedded brand mark reads cleanly. Real-world branded QRs can
      // afford ~20% of the code area lost to error correction.
      const cx = (SIZE - 1) / 2;
      const cy = (SIZE - 1) / 2;
      if (Math.abs(x - cx) <= CENTER_RADIUS && Math.abs(y - cy) <= CENTER_RADIUS) {
        return false;
      }
      // Density pattern — looks denser than the 11x11 version, more
      // photo-real.
      return (
        (x * 7 + y * 13 + x * y) % 3 === 0 ||
        (x + y) % 5 === 0 ||
        (x * y) % 7 === 1
      );
    })
  );
  return (
    <div className="relative">
      <div
        aria-hidden
        className="grid aspect-square w-full gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {modules.map((row, y) =>
          row.map((on, x) => (
            <span
              key={`${x}-${y}`}
              className={`block aspect-square rounded-[1px] ${on ? "bg-slate" : "bg-transparent"}`}
            />
          ))
        )}
      </div>
      {/* Embedded brand mark in the centre knockout. */}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 inline-flex h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-white ring-1 ring-slate/10"
      >
        <span className="flex h-[70%] w-[70%] items-center justify-center rounded-[3px] bg-slate">
          <svg viewBox="0 0 24 24" width="60%" height="60%">
            <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
          </svg>
        </span>
      </span>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="relative w-[58%] max-w-[270px] translate-y-2 animate-float rounded-[36px] bg-slate p-2 shadow-lift">
      <div className="rounded-[28px] bg-white p-4">
        {/* Status bar */}
        <div className="flex items-center justify-between text-[10px] text-slate/55">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-1 w-3 rounded-sm bg-slate/55" />
            <span className="h-1 w-3 rounded-sm bg-slate/55" />
            <span className="h-1.5 w-4 rounded-sm bg-slate/55" />
          </span>
        </div>

        <p className="mt-3 text-[10px] text-slate/50">Hello</p>
        <p className="text-[18px] font-semibold leading-tight text-slate">Table 12</p>
        <p className="mt-1 text-[10px] text-slate/55">What would you like to do?</p>

        <ul className="mt-4 space-y-2">
          <PhoneRow icon={<BellIcon />} title="Call Waiter" sub="Get the right help fast" />
          <PhoneRow icon={<ForkKnifeIcon />} title="View Menu" sub="Browse and order" />
          <PhoneRow icon={<ReceiptIcon />} title="Request Bill" sub="Bring me the tab" />
          <PhoneRow icon={<CardIcon />} title="Pay Bill" sub="Pay securely" />
          <PhoneRow icon={<StarIcon />} title="Leave Review" sub="Tell us about your experience" />
        </ul>

        <p className="mt-4 text-center text-[10px] text-umber">TabCall</p>
      </div>
    </div>
  );
}

function PhoneRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-oat px-3 py-2">
      <span
        aria-hidden
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-chartreuse/60 text-slate"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-slate">{title}</span>
        <span className="block text-[9px] text-slate/55">{sub}</span>
      </span>
    </li>
  );
}

/* ---------------------------------------------------------------------- */
/* Trusted strip                                                          */
/* ---------------------------------------------------------------------- */

function TrustedStrip() {
  const brands = [
    { name: "LUNA", suffix: "LOUNGE", style: "tracking-[0.32em] font-medium" },
    { name: "THE OAK & VINE", suffix: "", style: "italic font-semibold" },
    { name: "URBAN", suffix: "BISTRO", style: "tracking-[0.28em] font-medium" },
    { name: "NIGHTFALL", suffix: "CLUB", style: "tracking-[0.18em] font-semibold" },
    { name: "harbor", suffix: "EATS", style: "lowercase font-light" },
  ];
  return (
    <section className="bg-oat py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.24em] text-umber">
          Trusted by modern hospitality brands
        </p>
        <div className="mt-7 grid grid-cols-2 items-center gap-y-6 sm:grid-cols-3 md:flex md:justify-between">
          {brands.map((b) => (
            <div key={b.name} className="flex flex-col items-center text-slate/55">
              <span className={`text-base ${b.style}`}>{b.name}</span>
              {b.suffix ? (
                <span className="mt-0.5 text-[10px] uppercase tracking-[0.28em] text-slate/45">
                  {b.suffix}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Feature grid                                                           */
/* ---------------------------------------------------------------------- */

const FEATURES = [
  {
    icon: <QRIcon />,
    tone: "butter" as const,
    title: "QR Ordering",
    body:
      "Guests browse the digital menu, place orders, and send them directly to your kitchen, all from their table.",
  },
  {
    icon: <SplitCardIcon />,
    tone: "sage" as const,
    title: "QR Payments & Bill Splitting",
    body:
      "Guests can view the bill, split it, add tips, and pay securely in seconds. Works with all major cards and wallets.",
  },
  {
    icon: <BellIcon />,
    tone: "butter" as const,
    title: "Call Waiter",
    body:
      "One tap to call a waiter. Reduce wait times and improve guest satisfaction instantly.",
  },
  {
    icon: <StarOutlineIcon />,
    tone: "butter" as const,
    title: "Reviews & Feedback",
    body:
      "Collect more reviews and feedback from happy guests to grow your reputation.",
  },
  {
    icon: <ChartIcon />,
    tone: "sage" as const,
    title: "Analytics & Insights",
    body:
      "Track performance, response times, table turnover, and staff productivity in real time.",
  },
  {
    icon: <PlugIcon />,
    tone: "sage" as const,
    title: "POS Integrations",
    body:
      "Seamlessly integrate with your POS system for real-time orders, menus, and payments.",
  },
];

function FeatureGrid() {
  return (
    <section id="features" className="bg-oat py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeader
          eyebrow="Built for hospitality"
          title="Everything you need in one platform"
          sub="TabCall brings every guest interaction into one seamless experience for your team and your customers."
          pillEyebrow
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  tone,
  title,
  body,
}: {
  icon: React.ReactNode;
  tone: "butter" | "sage";
  title: string;
  body: string;
}) {
  const tile =
    tone === "butter" ? "bg-chartreuse/55 text-slate" : "bg-sea-soft/70 text-slate";
  return (
    <article className="group rounded-2xl border border-umber-soft/30 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-umber-soft/55 hover:shadow-soft md:p-7">
      <span
        aria-hidden
        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${tile}`}
      >
        {icon}
      </span>
      <h3 className="mt-5 text-[18px] font-semibold text-slate md:text-[20px]">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-slate/65 md:text-[15px]">{body}</p>
      <p className="mt-5 text-sm font-medium text-slate transition-colors group-hover:text-umber">
        Learn more
        <span aria-hidden className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">→</span>
      </p>
    </article>
  );
}

/* ---------------------------------------------------------------------- */
/* How TabCall works                                                      */
/* ---------------------------------------------------------------------- */

const STEPS = [
  {
    n: "1",
    title: "Scan QR Code",
    body: "Guests scan the QR code on their table to access the menu and services.",
  },
  {
    n: "2",
    title: "Order, Call or Pay",
    body: "They can place orders, call a waiter, request the bill, or make payments.",
  },
  {
    n: "3",
    title: "We handle the rest",
    body: "Your staff gets notified instantly and your operations run smoothly.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="bg-oat pb-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="overflow-hidden rounded-[32px] bg-linen p-6 ring-1 ring-umber-soft/30 md:p-12">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <SectionHeader
                eyebrow="Simple for everyone"
                title="How TabCall works"
                sub="Three simple steps to a better hospitality experience."
                left
                pillEyebrow
              />

              <ol className="mt-8 space-y-5">
                {STEPS.map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate ring-1 ring-umber-soft/40"
                    >
                      {s.n}
                    </span>
                    <div>
                      <p className="text-[16px] font-semibold text-slate md:text-[18px]">{s.title}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-slate/65">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Right: menu phone mockup */}
            <MenuPhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuPhoneMockup() {
  const items = [
    { name: "Burrata Salad", sub: "Tomatoes & basil", price: "$14.00" },
    { name: "Truffle Pasta", sub: "Hand-rolled", price: "$24.00" },
    { name: "Grilled Salmon", sub: "Lemon butter", price: "$26.00" },
    { name: "Golden Shrimp", sub: "Spiced rice", price: "$22.00" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-[40px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, rgba(242, 231, 183, 0.35) 0%, rgba(247, 245, 242, 0) 70%)",
        }}
      />
      <div className="rounded-[36px] bg-slate p-2 shadow-lift">
        <div className="rounded-[28px] bg-white p-4">
          <div className="flex items-center justify-between text-[10px] text-slate/55">
            <span>9:41</span>
            <span className="font-medium text-slate/70">Our Menu</span>
            <span aria-hidden className="opacity-0">9:41</span>
          </div>

          <div className="mt-3 flex gap-2 text-[10px]">
            {["Starters", "Mains", "Drinks", "Desserts"].map((t, i) => (
              <span
                key={t}
                className={
                  i === 1
                    ? "rounded-full bg-slate px-2.5 py-1 font-semibold text-oat"
                    : "rounded-full bg-oat px-2.5 py-1 text-slate/65"
                }
              >
                {t}
              </span>
            ))}
          </div>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Popular</p>

          <ul className="mt-2 space-y-2">
            {items.map((it) => (
              <li key={it.name} className="flex items-center gap-3 rounded-2xl bg-oat p-2.5">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chartreuse/60 text-slate"
                >
                  <PlateIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate">{it.name}</p>
                  <p className="text-[9px] text-slate/55">{it.sub}</p>
                </div>
                <span className="text-[10px] font-semibold text-slate">{it.price}</span>
                <button
                  type="button"
                  className="rounded-full bg-slate px-2.5 py-1 text-[9px] font-semibold text-oat"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Metrics strip                                                          */
/* ---------------------------------------------------------------------- */

const METRICS = [
  { icon: <TurnoverIcon />, value: "30%+", label: "Increase in table turnover" },
  { icon: <TipIcon />, value: "20%+", label: "Increase in tips with in-table payments" },
  { icon: <CostIcon />, value: "30%+", label: "Reduction in operational costs" },
  { icon: <PeopleIcon />, value: "10K+", label: "Restaurants & venues trust TabCall" },
];

function Metrics() {
  return (
    <section className="bg-oat pb-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="rounded-[28px] bg-sea-soft/55 p-6 md:p-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.label} className="text-center">
                <span
                  aria-hidden
                  className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-slate ring-1 ring-white"
                >
                  {m.icon}
                </span>
                <p className="mt-4 text-[28px] font-semibold tracking-tight text-slate md:text-[36px]">
                  {m.value}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-slate/65 md:text-[13px]">
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Testimonials                                                           */
/* ---------------------------------------------------------------------- */

const TESTIMONIALS = [
  {
    quote:
      "TabCall has completely transformed the way we serve our guests. The QR ordering and payments are so easy to use!",
    name: "Maria Lopez",
    role: "Owner, Luna Lounge",
    initials: "ML",
    tone: "butter" as const,
  },
  {
    quote:
      "Our staff is happier, guests are happier, and our table turnover increased significantly.",
    name: "James Carter",
    role: "Manager, Urban Bistro",
    initials: "JC",
    tone: "sage" as const,
  },
  {
    quote:
      "Bill splitting and instant payments have made a huge difference. Highly recommended!",
    name: "Sophie Bennett",
    role: "Owner, Harbor Eats",
    initials: "SB",
    tone: "butter" as const,
  },
];

function Testimonials() {
  return (
    <section className="bg-oat pb-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeader
          eyebrow="Loved by restaurants"
          title="What our customers say"
          pillEyebrow
        />

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <article
              key={t.name}
              className="rounded-2xl border border-umber-soft/30 bg-white p-6 shadow-card md:p-7"
            >
              <Stars />
              <p className="mt-4 text-[14px] leading-relaxed text-slate/80 md:text-[15px]">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span
                  aria-hidden
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-slate " +
                    (t.tone === "butter" ? "bg-chartreuse/70" : "bg-sea-soft")
                  }
                >
                  {t.initials}
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-slate">{t.name}</p>
                  <p className="text-[11px] text-umber">{t.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Pagination dots — purely decorative */}
        <div className="mt-8 flex items-center justify-center gap-2" aria-hidden>
          <span className="h-1.5 w-6 rounded-full bg-slate" />
          <span className="h-1.5 w-1.5 rounded-full bg-umber-soft/60" />
          <span className="h-1.5 w-1.5 rounded-full bg-umber-soft/60" />
        </div>
      </div>
    </section>
  );
}

function Stars() {
  return (
    <span aria-label="5 out of 5 stars" className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#F2C94C">
          <path d="M12 2l2.9 6.3 6.9.6-5.2 4.7 1.6 6.8L12 17l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
        </svg>
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Pricing — preserved from prior build; trimmed visual treatment to fit  */
/* ---------------------------------------------------------------------- */

const PRICING_TIERS: {
  key: "starter" | "growth" | "pro" | "founding";
  name: string;
  price: string;
  sub: string;
  tagline: string;
  trial: boolean;
  cta: string;
  ctaHref: string;
  highlight: boolean;
}[] = [
  {
    key: "starter",
    name: "Starter",
    price: "Free",
    sub: "Up to 5 tables. No card.",
    tagline: "Call waiter, request bill, reviews. Live tonight.",
    trial: false,
    cta: "Start free",
    ctaHref: "/signup",
    highlight: false,
  },
  {
    key: "growth",
    name: "Growth",
    price: "$99",
    sub: "per month, up to 25 tables",
    tagline:
      "Full menu, pre-orders, splits, tip pool, reservations, waitlist, analytics.",
    trial: true,
    cta: "Start free trial",
    ctaHref: "/signup?plan=growth",
    highlight: true,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$299",
    sub: "per month, unlimited tables",
    tagline:
      "Loyalty, promotions, branding, benchmarks, multi-location, POS layer.",
    trial: true,
    cta: "Start free trial",
    ctaHref: "/signup?plan=pro",
    highlight: false,
  },
  {
    key: "founding",
    name: "Founding",
    price: "On request",
    sub: "Concierge onboarding only",
    tagline:
      "Everything in Pro, plus a TabCall-managed setup and a dedicated Slack channel.",
    trial: false,
    cta: "Talk to us",
    ctaHref: "mailto:hello@tab-call.com",
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="bg-oat pb-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeader
          eyebrow="Pricing"
          title="Pick the plan that matches the floor"
          sub="Starter is free at 5 tables. Growth and Pro start with a 14-day free trial. Founding is concierge only."
          pillEyebrow
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((t) => (
            <article
              key={t.key}
              className={[
                "flex flex-col rounded-2xl p-6 transition-all hover:-translate-y-0.5",
                t.highlight
                  ? "border-2 border-chartreuse bg-white shadow-lift ring-1 ring-chartreuse/40"
                  : "border border-umber-soft/30 bg-white shadow-card",
              ].join(" ")}
            >
              {t.trial ? (
                <span className="inline-flex w-fit items-center rounded-full bg-chartreuse px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">
                  14-day free trial
                </span>
              ) : (
                <span className="inline-block h-[22px]" aria-hidden />
              )}

              <h3 className="mt-4 text-lg font-semibold text-slate">{t.name}</h3>

              <p className="mt-3 text-[34px] font-semibold leading-none tracking-tight text-slate">
                {t.price}
              </p>
              <p className="mt-1 text-xs text-slate/55">{t.sub}</p>

              <p className="mt-4 text-sm leading-relaxed text-slate/70">{t.tagline}</p>

              <Link
                href={t.ctaHref}
                className={[
                  "mt-6 inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                  t.highlight
                    ? "bg-chartreuse text-slate hover:bg-chartreuse/85"
                    : "border border-slate/15 bg-white text-slate hover:border-slate/30",
                ].join(" ")}
              >
                {t.cta}
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate/55">
          Growth and Pro start with a 14-day free trial. No card needed to
          start. All plans run month to month. Stripe processing (2.9% + 30¢)
          is passed through at cost.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Final CTA                                                              */
/* ---------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="bg-oat pb-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-umber-soft/30 shadow-card">
          <div className="grid items-center gap-8 md:grid-cols-[1.4fr_1fr]">
            <div className="p-8 md:p-12">
              <h2 className="text-[28px] font-semibold leading-tight tracking-tight text-slate md:text-[40px]">
                Ready to elevate your guest experience?
              </h2>
              <p className="mt-4 max-w-md text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
                Join thousands of hospitality businesses using TabCall to
                deliver exceptional service every day.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-chartreuse px-6 py-3 text-sm font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  Get Started Free
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full border border-umber-soft/50 bg-white px-6 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/30"
                >
                  Book a Demo
                </Link>
              </div>

              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-slate/65">
                <li className="inline-flex items-center gap-1.5">
                  <CheckDot /> Free 14-day trial
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <CheckDot /> No credit card required
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <CheckDot /> Setup in minutes
                </li>
              </ul>
            </div>

            <div
              aria-hidden
              className="relative hidden h-full min-h-[280px] md:block"
              style={{
                background:
                  "linear-gradient(135deg, rgba(199, 214, 207, 0.6) 0%, rgba(242, 231, 183, 0.5) 100%)",
              }}
            >
              {/* Decorative dining vignette: stylised plates + cutlery so we
                  do not depend on an image asset. */}
              <DiningVignette />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DiningVignette() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="grid w-full max-w-[260px] grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="flex aspect-square items-center justify-center rounded-2xl bg-white/80 ring-1 ring-white"
          >
            <span className="block h-3/5 w-3/5 rounded-full bg-oat ring-1 ring-umber-soft/40" />
          </span>
        ))}
      </div>
    </div>
  );
}

function CheckDot() {
  return (
    <span
      aria-hidden
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-chartreuse text-slate"
    >
      <svg width="9" height="9" viewBox="0 0 12 12">
        <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Footer                                                                 */
/* ---------------------------------------------------------------------- */

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "How It Works", href: "#how" },
      { label: "Pricing", href: "#pricing" },
      { label: "Integrations", href: "#features" },
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

function Footer() {
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

/* ---------------------------------------------------------------------- */
/* Shared SectionHeader                                                   */
/* ---------------------------------------------------------------------- */

function SectionHeader({
  eyebrow,
  title,
  sub,
  left = false,
  pillEyebrow = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  left?: boolean;
  pillEyebrow?: boolean;
}) {
  const wrap = left ? "" : "mx-auto max-w-2xl text-center";
  return (
    <header className={wrap}>
      {pillEyebrow ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
          {eyebrow}
        </span>
      ) : (
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-umber">
          {eyebrow}
        </p>
      )}
      <h2 className={`mt-4 text-[28px] font-semibold leading-[1.1] tracking-tight text-slate md:text-[36px] lg:text-[40px] ${left ? "" : ""}`}>
        {title}
      </h2>
      {sub ? (
        <p className={`mt-4 text-[14px] leading-relaxed text-slate/65 md:text-[15px] ${left ? "max-w-md" : "mx-auto max-w-2xl"}`}>
          {sub}
        </p>
      ) : null}
    </header>
  );
}

/* ---------------------------------------------------------------------- */
/* Icons                                                                  */
/* ---------------------------------------------------------------------- */

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ForkKnifeIcon({ small = false }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3v8a2 2 0 0 0 2 2v8" />
      <path d="M5 3v6a2 2 0 0 0 2 2" />
      <path d="M11 3v6a2 2 0 0 1-2 2" />
      <path d="M17 3c-1.5 0-3 1.5-3 4v5a2 2 0 0 0 2 2h1v7" />
    </svg>
  );
}

function CardIcon({ small = false }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

function StarIcon({ small = false }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.7 1.6 6.8L12 17l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
    </svg>
  );
}

function StarOutlineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.7 1.6 6.8L12 17l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 3 5.18 2 2 0 0 1 5 3h2.09a2 2 0 0 1 2 1.72c.13.9.36 1.78.7 2.6a2 2 0 0 1-.45 2.11l-1 1a16 16 0 0 0 6 6l1-1a2 2 0 0 1 2.11-.45c.82.34 1.7.57 2.6.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  );
}

function QRIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14h1v1h-1zM14 20h1v1h-1zM18 17h3M17 17v3M20 20h1v1h-1z" />
    </svg>
  );
}

function SplitCardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="13" height="11" rx="2" />
      <path d="M3 9h13" />
      <rect x="9" y="11" width="12" height="9" rx="2" />
      <path d="M9 14h12" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20V8" />
      <path d="M10 20V4" />
      <path d="M16 20v-8" />
      <path d="M22 20V14" />
      <path d="M2 20h22" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" />
      <path d="M12 17v5" />
    </svg>
  );
}

function PlateIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
    </svg>
  );
}

function TurnoverIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function TipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18" />
      <path d="M17 6.5C17 4.6 14.8 3 12 3S7 4.6 7 6.5c0 4.5 10 3.5 10 8 0 1.9-2.2 3.5-5 3.5S7 16.4 7 14.5" />
    </svg>
  );
}

function CostIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 17h18M3 12h12M3 7h6" />
      <path d="M21 9l-3 3 3 3" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" />
      <circle cx="17" cy="10" r="2.6" />
      <path d="M15 20c0-2 1.5-4 4-4s4 2 4 4" />
    </svg>
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
