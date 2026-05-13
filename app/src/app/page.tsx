import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { MarketingNav, MarketingFooter } from "./marketing-chrome";

/**
 * TabCall landing page. Faithful to the design mockup direction:
 *   - dark primary-deep on CTAs / navigation,
 *   - brand-lime as the accent color (badges, stars, hover borders),
 *   - light cream surfaces, Material Symbols Outlined icons,
 *   - 3-up feature grid, dark "How TabCall works" block, beige metrics strip,
 *   - photo-overlay final CTA, 5-column footer.
 *
 * Each "Get Started" or "Pricing" CTA still routes to the scoped page
 * (/signup, /pricing, /how-it-works, /features) so click-to-detail nav
 * behavior is preserved.
 */

export const metadata: Metadata = {
  title: "TabCall · all-in-one hospitality platform",
  description:
    "The all-in-one hospitality operating system that bridges the gap between digital convenience and human hospitality.",
};

/** Resolve a feature image from /public/landing/features/ if a file was saved
 *  (used by the hero composition + the floor-shot in the final CTA). */
function findLandingImage(name: string): string | null {
  const dir = path.join(process.cwd(), "public", "landing");
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(dir, `${name}.${ext}`);
    if (fs.existsSync(p)) return `/landing/${name}.${ext}`;
  }
  return null;
}

export default function LandingPage() {
  return (
    <div className="overflow-x-hidden bg-surface-warm text-on-surface selection:bg-brand-lime selection:text-primary-deep">
      <MarketingNav />

      <main className="pt-24">
        <Hero />
        <TrustedBy />
        <FeaturesGrid />
        <HowItWorks />
        <Metrics />
        <Testimonials />
        <FinalCta />
      </main>

      <MarketingFooter />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Hero                                                                   */
/* ---------------------------------------------------------------------- */

function Hero() {
  const heroImage = findLandingImage("hero");
  return (
    <section className="hero-gradient relative overflow-hidden">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-16 px-5 py-16 md:px-10 lg:flex-row lg:py-28">
        {/* LEFT: copy column */}
        <div className="flex-1 space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-lime/20 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-on-secondary-fixed-variant">
            <span aria-hidden className="h-2 w-2 rounded-full bg-brand-lime" />
            New: Multi-level dining analytics
          </div>

          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-primary-deep md:text-5xl lg:text-[56px]">
            Delight guests.
            <br />
            <span className="text-on-primary-container">Empower staff.</span>
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-on-surface-variant md:text-lg">
            The all-in-one hospitality operating system that bridges the gap
            between digital convenience and human hospitality. Scale your
            operations without losing the personal touch.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-primary-deep px-7 py-3.5 text-base font-semibold text-white transition-all hover:shadow-lift active:scale-95"
            >
              Book a Demo
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-outline-variant/60 bg-white px-7 py-3.5 text-base font-semibold text-primary-deep transition-all hover:bg-surface-container-low"
            >
              View Pricing
            </Link>
          </div>

          <ul className="grid grid-cols-2 gap-6 border-t border-outline-variant/40 pt-10 sm:grid-cols-4">
            <ShortcutTile icon="person_raised_hand" label="Call Waiter" href="/features/call-waiter" />
            <ShortcutTile icon="restaurant_menu" label="Digital Order" href="/features/qr-orders" />
            <ShortcutTile icon="payments" label="Fast Pay" href="/features/qr-payments" />
            <ShortcutTile icon="grade" label="Reviews" href="/features/reviews" />
          </ul>
        </div>

        {/* RIGHT: visual column */}
        <div className="relative flex-1">
          <div className="relative z-10 overflow-hidden rounded-3xl shadow-lift">
            {heroImage ? (
              <Image
                src={heroImage}
                alt="A brightly lit modern restaurant with a QR table tent and a phone displaying the TabCall menu"
                width={640}
                height={600}
                className="h-[480px] w-full object-cover md:h-[560px]"
                priority
              />
            ) : (
              <HeroCssScene />
            )}
          </div>

          {/* Floating "Request resolved" card */}
          <div className="absolute -bottom-8 left-[-10px] z-20 max-w-[260px] rounded-2xl bg-white p-5 shadow-lift md:-left-10">
            <div className="mb-3 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-tertiary-sage text-tertiary">
                <span aria-hidden className="material-symbols-outlined fill">done_all</span>
              </span>
              <div>
                <p className="font-bold text-primary-deep">Table 12</p>
                <p className="text-xs text-on-surface-variant">Request Resolved</p>
              </div>
            </div>
            <p className="text-sm font-medium text-on-surface">
              &ldquo;Guest requested extra napkins and water.&rdquo;
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShortcutTile({
  icon,
  label,
  href,
}: {
  icon: string;
  label: string;
  href: string;
}) {
  return (
    <li>
      <Link href={href} className="group flex flex-col items-start gap-2">
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest text-primary-deep transition-colors group-hover:bg-brand-lime"
        >
          <span className="material-symbols-outlined">{icon}</span>
        </span>
        <span className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
      </Link>
    </li>
  );
}

/** Light hospitality scene fallback when no /public/landing/hero.{png,jpg,…}
 *  file has been added. Carries the same visual weight as a real photo
 *  (a phone + QR tent on a soft cream backdrop) and matches the mockup's
 *  composition. */
function HeroCssScene() {
  return (
    <div
      className="relative h-[480px] w-full md:h-[560px]"
      style={{
        background:
          "linear-gradient(180deg, #fff8f6 0%, #fff1eb 60%, #fae4da 100%)",
      }}
    >
      <span
        aria-hidden
        className="absolute right-6 top-6 h-24 w-24 rounded-full bg-tertiary-sage/60 blur-2xl"
      />
      <span
        aria-hidden
        className="absolute left-10 bottom-16 h-20 w-20 rounded-full bg-brand-lime/30 blur-xl"
      />

      <div className="absolute inset-0 flex items-center justify-center gap-4 px-6">
        <HeroQRTent />
        <HeroPhone />
      </div>
    </div>
  );
}

function HeroQRTent() {
  return (
    <div className="relative w-[42%] max-w-[220px] -rotate-1 rounded-2xl bg-white p-4 shadow-lift ring-1 ring-outline-variant/30">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate"
          >
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path
                d="M 6 11 Q 12 6, 18 11"
                fill="none"
                stroke="#F2E7B7"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
            </svg>
          </span>
          <span className="text-[11px] font-bold text-primary-deep">TabCall</span>
        </span>
        <span className="rounded-full bg-tertiary-sage px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-tertiary">
          Table 12
        </span>
      </div>
      <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.22em] text-on-surface-variant">
        Scan to
      </p>
      <p className="text-[18px] font-bold leading-[1.05] text-primary-deep">
        Order &amp; Pay
      </p>
      <div className="relative mt-3 rounded-xl bg-white p-2 ring-1 ring-outline-variant/30">
        <QRPattern />
      </div>
      <p className="mt-3 text-center text-[9px] text-on-surface-variant">
        Point camera · No app needed
      </p>
    </div>
  );
}

function HeroPhone() {
  return (
    <div className="relative w-[52%] max-w-[260px] translate-y-2 rounded-[32px] bg-primary-deep p-2 shadow-lift">
      <div className="rounded-[24px] bg-white p-4">
        <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
          <span>9:41</span>
          <span className="font-medium">Table 12</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <p className="mt-3 text-[10px] text-on-surface-variant">Hello</p>
        <p className="text-[18px] font-bold leading-tight text-primary-deep">
          What can we bring?
        </p>
        <ul className="mt-3 space-y-2">
          {[
            { icon: "person_raised_hand", label: "Call Waiter", active: true },
            { icon: "restaurant_menu", label: "View Menu" },
            { icon: "receipt_long", label: "Request Bill" },
            { icon: "payments", label: "Pay Bill" },
          ].map((r) => (
            <li
              key={r.label}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                r.active ? "bg-brand-lime" : "bg-surface-container-low"
              }`}
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-primary-deep ring-1 ring-outline-variant/40"
              >
                <span className="material-symbols-outlined text-[14px]">{r.icon}</span>
              </span>
              <span className="text-[11px] font-semibold text-primary-deep">{r.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function QRPattern() {
  const SIZE = 11;
  const modules: boolean[][] = Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) => {
      const inLocator =
        (y < 3 && (x < 3 || x > SIZE - 4)) || (y > SIZE - 4 && x < 3);
      if (inLocator) {
        const ly = y < 3 ? y : y - (SIZE - 3);
        const lx = x < 3 ? x : x > SIZE - 4 ? x - (SIZE - 3) : x;
        if (ly === 1 && lx === 1) return true;
        return ly === 0 || ly === 2 || lx === 0 || lx === 2;
      }
      return ((x * 7 + y * 13 + x * y) % 3 === 0) || ((x + y) % 5 === 0);
    })
  );
  return (
    <div
      aria-hidden
      className="grid aspect-square w-full gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {modules.map((row, y) =>
        row.map((on, x) => (
          <span
            key={`${x}-${y}`}
            className={`block aspect-square rounded-[1px] ${on ? "bg-primary-deep" : "bg-transparent"}`}
          />
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Trusted by                                                             */
/* ---------------------------------------------------------------------- */

function TrustedBy() {
  return (
    <section className="border-y border-outline-variant/30 bg-surface-container-lowest py-12">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <p className="mb-9 text-center text-[12px] font-semibold uppercase tracking-[0.2em] text-on-surface-variant">
          Trusted by the world&rsquo;s finest venues
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-primary-deep opacity-70 transition-all hover:opacity-100 lg:gap-x-24">
          <span className="text-xl font-bold italic md:text-2xl">Luna Lounge</span>
          <span className="text-xl font-bold tracking-wider md:text-2xl">URBAN BISTRO</span>
          <span className="flex items-center gap-1.5 text-xl font-bold md:text-2xl">
            <span aria-hidden className="material-symbols-outlined">anchor</span>
            Harbor Eats
          </span>
          <span className="text-xl font-bold md:text-2xl" style={{ fontFamily: "Georgia, serif" }}>
            Oak &amp; Vine
          </span>
          <span className="text-xl font-bold tracking-[0.2em] md:text-2xl">NIGHTFALL</span>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Features grid                                                          */
/* ---------------------------------------------------------------------- */

const FEATURE_CARDS = [
  {
    icon: "qr_code_2",
    title: "Dynamic QR Codes",
    body:
      "Instantly update menus and promotions. Map unique codes to specific tables, bars, or poolside loungers.",
    href: "/features/qr-orders",
  },
  {
    icon: "kitchen",
    title: "Kitchen Display System",
    body:
      "Streamline communication between floor and kitchen with real-time ticket management and timing alerts.",
    href: "/features/pos-integration",
  },
  {
    icon: "analytics",
    title: "Deep Data Insights",
    body:
      "Identify your most profitable items, peak hours, and staff performance metrics at a single glance.",
    href: "/features/analytics",
  },
  {
    icon: "groups",
    title: "Staff Management",
    body:
      "Efficiently manage shifts, track tips, and empower your team with mobile request notifications.",
    href: "/features/call-waiter",
  },
  {
    icon: "credit_card",
    title: "Integrated Payments",
    body:
      "Support Apple Pay, Google Pay, and all major cards. Enable split-bill functionality from the table.",
    href: "/features/qr-payments",
  },
  {
    icon: "inventory",
    title: "Real-time Inventory",
    body:
      "Automated low-stock alerts and 86-list updates ensure guests never order what you can&rsquo;t serve.",
    href: "/features/pos-integration",
  },
];

function FeaturesGrid() {
  return (
    <section id="features" className="bg-surface-warm py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <div className="mb-14 space-y-4 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-primary-deep md:text-4xl">
            Everything you need in one platform
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-on-surface-variant md:text-lg">
            Powerful tools designed for the rigorous demands of busy dining
            floors and professional kitchens.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group rounded-xl border border-outline-variant/30 bg-white p-8 shadow-card transition-colors hover:border-brand-lime/60"
            >
              <span
                aria-hidden
                className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container-low text-primary-deep transition-colors group-hover:bg-brand-lime"
              >
                <span className="material-symbols-outlined">{f.icon}</span>
              </span>
              <h3 className="mb-3 text-xl font-semibold text-primary-deep">{f.title}</h3>
              <p
                className="leading-relaxed text-on-surface-variant"
                dangerouslySetInnerHTML={{ __html: f.body }}
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* How TabCall works (dark section)                                       */
/* ---------------------------------------------------------------------- */

const HOW_STEPS = [
  {
    n: "1",
    title: "Scan QR Code",
    body:
      "Guests scan a unique code at their table to view a high-resolution, multi-language digital menu.",
  },
  {
    n: "2",
    title: "Order, Call or Pay",
    body:
      "Guests can send orders directly to the kitchen, request a waiter for personalized service, or pay instantly.",
  },
  {
    n: "3",
    title: "We handle the rest",
    body:
      "Notifications are routed instantly to staff tablets and kitchen displays for efficient, coordinated action.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="bg-primary-deep py-24 text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-16 px-5 md:px-10 lg:flex-row lg:gap-20">
        <div className="flex-1 space-y-10">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl lg:text-[44px]">
            How TabCall works
          </h2>
          <ol className="space-y-10">
            {HOW_STEPS.map((s) => (
              <li key={s.n} className="flex gap-6">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brand-lime font-bold text-brand-lime"
                >
                  {s.n}
                </span>
                <div>
                  <h4 className="text-xl font-bold">{s.title}</h4>
                  <p className="mt-2 leading-relaxed text-on-primary-container">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            href="/how-it-works"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-lime hover:opacity-80"
          >
            See the full walkthrough <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="flex-1">
          <div className="relative mx-auto max-w-sm">
            <div aria-hidden className="absolute -inset-4 rounded-full bg-brand-lime/20 blur-3xl" />
            <HowItWorksPhone />
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksPhone() {
  const items = [
    { name: "Burrata Salad", sub: "Tomatoes & basil", price: "$14.00" },
    { name: "Truffle Pasta", sub: "Hand-rolled", price: "$24.00" },
    { name: "Grilled Salmon", sub: "Lemon butter", price: "$26.00" },
    { name: "Golden Shrimp", sub: "Spiced rice", price: "$22.00" },
  ];
  return (
    <div className="relative z-10 rounded-[48px] border-8 border-primary-container bg-primary-container p-1 shadow-lift">
      <div className="rounded-[40px] bg-white p-5">
        <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
          <span>9:41</span>
          <span className="font-medium">Our Menu</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>

        <div className="mt-3 flex gap-2 text-[10px]">
          {["Starters", "Mains", "Drinks", "Desserts"].map((t, i) => (
            <span
              key={t}
              className={
                i === 1
                  ? "rounded-full bg-primary-deep px-2.5 py-1 font-semibold text-white"
                  : "rounded-full bg-surface-container-low px-2.5 py-1 text-on-surface-variant"
              }
            >
              {t}
            </span>
          ))}
        </div>

        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-on-secondary-fixed-variant">
          Popular
        </p>

        <ul className="mt-2 space-y-2">
          {items.map((it) => (
            <li
              key={it.name}
              className="flex items-center gap-3 rounded-2xl bg-surface-container-low p-2.5"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-lime/40 text-primary-deep"
              >
                <span className="material-symbols-outlined text-[18px]">restaurant</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-primary-deep">{it.name}</p>
                <p className="text-[9px] text-on-surface-variant">{it.sub}</p>
              </div>
              <span className="text-[10px] font-semibold text-primary-deep">{it.price}</span>
              <button
                type="button"
                className="rounded-full bg-primary-deep px-2.5 py-1 text-[9px] font-semibold text-white"
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Metrics                                                                */
/* ---------------------------------------------------------------------- */

const METRICS = [
  { value: "30%+", label: "Table Turnover" },
  { value: "20%+", label: "Average Tips" },
  { value: "30%+", label: "Cost Reduction" },
  { value: "10K+", label: "Venues Worldwide" },
];

function Metrics() {
  return (
    <section className="bg-secondary-container-warm py-20">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <div className="grid grid-cols-2 gap-12 text-center lg:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label}>
              <p className="text-[40px] font-semibold tracking-tight text-primary-deep md:text-[48px]">
                {m.value}
              </p>
              <p className="mt-2 text-[12px] font-semibold uppercase tracking-wider text-on-secondary-container">
                {m.label}
              </p>
            </div>
          ))}
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
      "TabCall has completely transformed our Friday nights. My staff is less stressed, and our table turnover has never been higher.",
    name: "Marcus Chen",
    role: "Owner, Urban Bistro",
    initials: "MC",
    tone: "lime" as const,
  },
  {
    quote:
      "The analytics provide a level of visibility we never had before. We can see exactly what's selling and when, making our inventory orders perfect.",
    name: "Sarah Jenkins",
    role: "Manager, Harbor Eats",
    initials: "SJ",
    tone: "sage" as const,
  },
  {
    quote:
      "Guests love the convenience of paying at their table. It frees up our staff to focus on genuine guest engagement instead of terminal hunting.",
    name: "David Rossi",
    role: "General Manager, Nightfall",
    initials: "DR",
    tone: "warm" as const,
  },
];

function Testimonials() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-primary-deep md:text-4xl">
            Loved by restaurateurs everywhere
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <article
              key={t.name}
              className="rounded-xl border border-outline-variant/30 bg-surface-warm p-8"
            >
              <div className="mb-6 flex gap-1 text-brand-lime">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} aria-hidden className="material-symbols-outlined fill">grade</span>
                ))}
              </div>
              <p className="mb-8 italic leading-relaxed text-on-surface">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className={
                    "flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-primary-deep " +
                    (t.tone === "lime"
                      ? "bg-brand-lime/60"
                      : t.tone === "sage"
                      ? "bg-tertiary-sage"
                      : "bg-surface-container-highest")
                  }
                >
                  {t.initials}
                </span>
                <div>
                  <p className="font-bold text-primary-deep">{t.name}</p>
                  <p className="text-sm text-on-surface-variant">{t.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Final CTA                                                              */
/* ---------------------------------------------------------------------- */

function FinalCta() {
  const ctaImage = findLandingImage("cta-kitchen");
  return (
    <section className="relative overflow-hidden py-28 md:py-32">
      <div className="absolute inset-0 z-0">
        {ctaImage ? (
          <Image
            src={ctaImage}
            alt="Busy upscale kitchen during service"
            fill
            sizes="100vw"
            className="object-cover opacity-25"
          />
        ) : (
          <div
            aria-hidden
            className="h-full w-full opacity-25"
            style={{
              background:
                "radial-gradient(60% 60% at 30% 30%, #7B5C46 0%, #2F2D3E 70%), radial-gradient(50% 50% at 80% 70%, #c8634f 0%, transparent 70%)",
            }}
          />
        )}
        <div aria-hidden className="absolute inset-0 bg-primary-deep/90" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-5 text-center md:px-10">
        <h2 className="mb-7 text-3xl font-semibold tracking-tight text-white md:text-4xl lg:text-[44px]">
          Ready to elevate your guest experience?
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-base text-primary-fixed opacity-90 md:text-lg">
          Join thousands of venues that are already growing their revenue
          and streamlining operations with TabCall.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-lg bg-brand-lime px-9 py-4 text-base font-bold text-primary-deep transition-transform hover:scale-105"
          >
            Start Your Free Trial
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-white/30 px-9 py-4 text-base font-bold text-white transition-colors hover:bg-white/10"
          >
            Talk to an Expert
          </Link>
        </div>
      </div>
    </section>
  );
}
