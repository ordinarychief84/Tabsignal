import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { MarketingNav, MarketingFooter, Logo } from "./marketing-chrome";
import { FEATURES, PRIMARY_FEATURE_SLUGS, getFeature } from "@/lib/features-data";

/**
 * Resolve a feature image from /public/landing/features/ if one was saved.
 * Falls back to the inline CSS mockup when no file is present. Looking up
 * the filesystem at build time keeps things zero-config: drop a file in,
 * the spotlight uses it automatically.
 */
function findFeatureImage(slug: string): string | null {
  const dir = path.join(process.cwd(), "public", "landing", "features");
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(dir, `${slug}.${ext}`);
    if (fs.existsSync(p)) {
      return `/landing/features/${slug}.${ext}`;
    }
  }
  return null;
}

/**
 * TabCall landing page — hospitality SaaS direction (Toast / Resy / Square feel).
 *
 * Structure (matches design mockups):
 *   1. Navbar           — shared chrome, Features + Resources dropdowns
 *   2. Hero             — Delight guests. Empower staff.
 *   3. Trusted-by strip
 *   4. Feature spotlights — 6 detail blocks with bespoke visuals
 *   5. How TabCall works — 3 steps, links to /how-it-works for the full page
 *   6. Metrics strip
 *   7. Testimonials
 *   8. Final CTA
 *   9. Footer           — shared chrome
 *
 * Pricing has its own scoped route at /pricing. Each "Learn more" on the
 * feature blocks routes to /features/[slug] so the user only sees content
 * for the feature they clicked. Same pattern across the navbar.
 */

export const metadata: Metadata = {
  title: "TabCall · all-in-one hospitality platform",
  description:
    "TabCall helps restaurants, bars, lounges, and cafés streamline service, increase revenue, and deliver exceptional guest experiences.",
};

export default function LandingPage() {
  return (
    <main className="bg-oat text-slate">
      <MarketingNav />
      <Hero />
      <TrustedStrip />
      <FeatureSpotlights />
      <HowItWorks />
      <Metrics />
      <Testimonials />
      <FinalCta />
      <MarketingFooter />
    </main>
  );
}

/* ---------------------------------------------------------------------- */
/* Hero                                                                   */
/* ---------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-oat">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 85% 15%, rgba(199, 214, 207, 0.45) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(45% 40% at 5% 90%, rgba(242, 231, 183, 0.32) 0%, rgba(247, 245, 242, 0) 65%)",
        }}
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-10 md:grid-cols-[1fr_1fr] md:gap-10 md:px-8 md:pb-24 md:pt-16 lg:gap-16 lg:pb-28 lg:pt-20">
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
            <Link
              href="/how-it-works"
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
            </Link>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FeatureShortcut tone="butter" title="Call Waiter" sub="Instant service" href="/features/call-waiter">
              <BellIcon />
            </FeatureShortcut>
            <FeatureShortcut tone="butter" title="Order" sub="From the table" href="/features/qr-orders">
              <ForkKnifeIcon />
            </FeatureShortcut>
            <FeatureShortcut tone="butter" title="Pay" sub="Securely" href="/features/qr-payments">
              <CardIcon />
            </FeatureShortcut>
            <FeatureShortcut tone="sage" title="Review" sub="Share feedback" href="/features/reviews">
              <StarIcon />
            </FeatureShortcut>
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function FeatureShortcut({
  tone,
  title,
  sub,
  href,
  children,
}: {
  tone: "butter" | "sage";
  title: string;
  sub: string;
  href: string;
  children: React.ReactNode;
}) {
  const tile = tone === "butter" ? "bg-chartreuse/55" : "bg-sea-soft/70";
  return (
    <li>
      <Link href={href} className="group block text-left">
        <span
          aria-hidden
          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate transition-transform group-hover:-translate-y-0.5 ${tile}`}
        >
          {children}
        </span>
        <p className="mt-3 text-sm font-semibold text-slate group-hover:text-umber">{title}</p>
        <p className="text-[12px] text-slate/55">{sub}</p>
      </Link>
    </li>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
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
  return (
    <div className="relative w-[44%] max-w-[240px] -rotate-1 animate-float-slow md:w-[46%]">
      <div
        aria-hidden
        className="absolute -bottom-2 left-3 right-3 -z-10 h-4 rounded-full bg-slate/15 blur-md"
      />
      <div className="relative overflow-hidden rounded-[20px] bg-white p-4 shadow-lift ring-1 ring-umber-soft/30">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate">
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

        <div className="mt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-umber">Scan to</p>
          <p className="text-[18px] font-semibold leading-[1.05] tracking-tight text-slate">Order &amp; Pay</p>
        </div>

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
            <ScanBracket pos="tl" />
            <ScanBracket pos="tr" />
            <ScanBracket pos="bl" />
            <ScanBracket pos="br" />
            <QRCodePattern />
          </div>
        </div>

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
  const SIZE = 13;
  const CENTER_RADIUS = 1.5;
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
      const cx = (SIZE - 1) / 2;
      const cy = (SIZE - 1) / 2;
      if (Math.abs(x - cx) <= CENTER_RADIUS && Math.abs(y - cy) <= CENTER_RADIUS) {
        return false;
      }
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
      <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-chartreuse/60 text-slate">
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
/* Feature spotlights — 6 blocks with bespoke visuals (matches mockup #2) */
/* ---------------------------------------------------------------------- */

function FeatureSpotlights() {
  return (
    <section id="features" className="bg-oat py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <SectionHeader
          eyebrow="Built for hospitality"
          title="Everything you need in one platform"
          sub="TabCall brings every guest interaction into one seamless experience for your team and your customers."
          pillEyebrow
        />

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {PRIMARY_FEATURE_SLUGS.map((slug) => {
            const f = getFeature(slug)!;
            const image = findFeatureImage(f.slug);
            return <SpotlightCard key={slug} feature={f} image={image} />;
          })}
        </div>

        <p className="mt-10 text-center text-[13px] text-slate/65">
          <Link href="/features" className="font-medium text-slate hover:text-umber">
            See all features →
          </Link>
        </p>
      </div>
    </section>
  );
}

function SpotlightCard({
  feature: f,
  image,
}: {
  feature: ReturnType<typeof getFeature> & object;
  image: string | null;
}) {
  return (
    <Link
      href={`/features/${f.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-umber-soft/30 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft md:flex-row md:items-stretch"
    >
      {/* LEFT: text column with icon-tile pinned to the bottom-left, matching
          the design mockup exactly. On mobile this stacks above the visual. */}
      <div className="flex flex-col p-6 md:w-[42%] md:p-8 lg:p-10">
        <h3 className="text-[22px] font-semibold leading-tight text-slate md:text-[26px] lg:text-[30px]">
          {f.title}
        </h3>
        <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
          {f.body}
        </p>

        <span
          aria-hidden
          className="mt-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate text-oat md:mt-auto md:pt-0"
        >
          <SpotlightIcon slug={f.slug} />
        </span>
      </div>

      {/* RIGHT: visual. Renders an image if a file was saved to
          public/landing/features/<slug>.{png,jpg,jpeg,webp}, otherwise
          falls back to the CSS mockup for the slug. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-linen md:aspect-auto md:min-h-[280px] md:w-[58%]">
        {image ? (
          <Image
            src={image}
            alt={`${f.title} preview`}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-end justify-center">
            <SpotlightVisual slug={f.slug} />
          </div>
        )}
      </div>
    </Link>
  );
}

function SpotlightVisual({ slug }: { slug: string }) {
  switch (slug) {
    case "qr-payments":
      return <SpotlightBillPhone />;
    case "qr-orders":
      return <SpotlightOrderPhone />;
    case "digital-menu":
      return <SpotlightMenuTablet />;
    case "wishlist":
      return <SpotlightWishlistPhone />;
    case "promotions":
      return <SpotlightPromos />;
    case "pos-integration":
      return <SpotlightPos />;
    default:
      return null;
  }
}

function MiniPhone({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[140px] translate-y-6 rounded-[24px] bg-slate p-1.5 shadow-lift">
      <div className="rounded-[18px] bg-white p-2.5">{children}</div>
    </div>
  );
}

function SpotlightBillPhone() {
  return (
    <div
      className="relative flex h-full w-full items-end justify-end pr-3"
      style={{
        background:
          "radial-gradient(60% 60% at 70% 60%, rgba(242, 231, 183, 0.35) 0%, rgba(251, 250, 247, 0) 65%)",
      }}
    >
      <MiniPhone>
        <div className="flex items-center justify-between text-[7px] text-slate/55">
          <span>9:41</span>
          <span className="font-semibold text-slate/70">Your Bill</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <p className="mt-1 text-center text-[6px] text-umber">Table 12</p>
        <ul className="mt-2 space-y-1 text-[7px] text-slate/80">
          <BillMini name="Truffle Pasta" price="$24.00" />
          <BillMini name="Grilled Salmon" price="$28.00" />
          <BillMini name="2 × Lemonade" price="$6.00" />
        </ul>
        <div className="mt-2 border-t border-slate/10 pt-1.5 text-[6.5px] text-slate/65">
          <BillMini name="Subtotal" price="$58.00" />
          <BillMini name="Tax" price="$4.64" />
          <BillMini name="Tip" price="$8.00" />
        </div>
        <div className="mt-1 border-t border-slate/10 pt-1.5 text-[8px] font-semibold text-slate">
          <BillMini name="Total" price="$70.64" />
        </div>
        <button type="button" className="mt-2 w-full rounded-md bg-slate py-1 text-[7px] font-semibold text-oat">
            Pay
        </button>
        <p className="mt-1 text-center text-[6px] text-slate/55">Pay with Card</p>
      </MiniPhone>
    </div>
  );
}

function BillMini({ name, price }: { name: string; price: string }) {
  return (
    <li className="flex items-baseline justify-between">
      <span>{name}</span>
      <span className="font-mono tabular-nums">{price}</span>
    </li>
  );
}

function SpotlightOrderPhone() {
  return (
    <div
      className="relative flex h-full w-full items-end justify-center"
      style={{
        background:
          "radial-gradient(50% 70% at 80% 30%, rgba(199, 214, 207, 0.55) 0%, rgba(251, 250, 247, 0) 65%), radial-gradient(40% 50% at 20% 80%, rgba(242, 231, 183, 0.4) 0%, rgba(251, 250, 247, 0) 65%)",
      }}
    >
      {/* Decorative plant silhouette top-right */}
      <span
        aria-hidden
        className="absolute right-3 top-3 h-12 w-12 rounded-full bg-sea-soft/70 blur-sm"
      />
      <MiniPhone>
        <div className="flex items-center justify-between text-[7px] text-slate/55">
          <span>9:41</span>
          <span className="font-semibold text-slate/70">Our Menu</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <div className="mt-2 flex gap-1 text-[6px]">
          {["All", "Starters", "Mains", "Drinks"].map((t, i) => (
            <span
              key={t}
              className={
                i === 0
                  ? "rounded-full bg-slate px-1.5 py-0.5 font-semibold text-oat"
                  : "rounded-full bg-oat px-1.5 py-0.5 text-slate/65"
              }
            >
              {t}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[7px] font-semibold uppercase tracking-[0.14em] text-umber">Popular</p>
        <ul className="mt-1 space-y-1">
          {[
            { n: "Burrata Salad", p: "$14" },
            { n: "Truffle Pasta", p: "$24" },
            { n: "Grilled Salmon", p: "$28" },
          ].map((it) => (
            <li key={it.n} className="flex items-center gap-1.5 rounded-md bg-oat p-1">
              <span aria-hidden className="h-5 w-5 shrink-0 rounded bg-chartreuse/60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[7px] font-semibold text-slate">{it.n}</p>
                <p className="text-[6px] text-slate/55">{it.p}</p>
              </div>
              <span className="rounded bg-slate px-1 py-0.5 text-[6px] font-semibold text-oat">Add</span>
            </li>
          ))}
        </ul>
      </MiniPhone>
    </div>
  );
}

function SpotlightMenuTablet() {
  return (
    <div
      className="relative flex h-full w-full items-end justify-end pr-3"
      style={{
        background:
          "radial-gradient(50% 50% at 70% 60%, rgba(199, 214, 207, 0.45) 0%, rgba(251, 250, 247, 0) 65%)",
      }}
    >
      <div className="w-[200px] translate-y-6 rounded-[18px] bg-slate p-1.5 shadow-lift">
        <div className="rounded-[12px] bg-white p-2">
          <div className="flex items-center justify-between">
            <p className="text-[8px] font-semibold text-slate">Our Menu</p>
            <div className="flex gap-0.5 text-[6px]">
              {["Starters", "Mains", "Drinks", "Desserts"].map((t, i) => (
                <span
                  key={t}
                  className={
                    i === 1
                      ? "rounded bg-slate px-1 py-0.5 font-semibold text-oat"
                      : "rounded bg-oat px-1 py-0.5 text-slate/65"
                  }
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <ul className="mt-2 space-y-1.5">
            {[
              { n: "Truffle Pasta", p: "$24.00" },
              { n: "Grilled Salmon", p: "$28.00" },
            ].map((it) => (
              <li key={it.n} className="flex items-start gap-1.5 rounded-md bg-oat p-1.5">
                <span aria-hidden className="h-8 w-8 shrink-0 rounded bg-chartreuse/60" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="truncate text-[7px] font-semibold text-slate">{it.n}</p>
                    <span className="text-[7px] font-semibold text-slate">{it.p}</span>
                  </div>
                  <p className="line-clamp-2 text-[6px] text-slate/55">Description placeholder lorem ipsum dolor.</p>
                  <button type="button" className="mt-0.5 rounded bg-slate px-1 py-0.5 text-[6px] font-semibold text-oat">
                    Add to Order
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SpotlightWishlistPhone() {
  return (
    <div
      className="relative flex h-full w-full items-end justify-center"
      style={{
        background:
          "radial-gradient(50% 60% at 50% 50%, rgba(242, 231, 183, 0.45) 0%, rgba(251, 250, 247, 0) 65%)",
      }}
    >
      <MiniPhone>
        <div className="flex items-center justify-between text-[7px] text-slate/55">
          <span>9:41</span>
          <span className="font-semibold text-slate/70">My Wishlist</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <ul className="mt-3 space-y-1">
          {[
            { n: "Spicy Tuna Roll", p: "$16.00" },
            { n: "Wagyu Steak", p: "$42.00" },
            { n: "Cheesecake", p: "$8.00" },
          ].map((it) => (
            <li key={it.n} className="flex items-center gap-1.5 rounded-md bg-oat p-1">
              <span aria-hidden className="h-5 w-5 shrink-0 rounded bg-chartreuse/60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[7px] font-semibold text-slate">{it.n}</p>
                <p className="text-[6px] text-slate/55">{it.p}</p>
              </div>
              <span aria-hidden className="text-slate/60">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="mt-3 w-full rounded-md bg-chartreuse py-1 text-[7px] font-semibold text-slate">
          Show to Waiter
        </button>
      </MiniPhone>
    </div>
  );
}

function SpotlightPromos() {
  return (
    <div className="relative flex h-full w-full items-end justify-center p-4">
      <div className="w-full max-w-[220px] translate-y-2 space-y-2">
        <div className="rounded-xl bg-coral-soft/80 p-3 shadow-card">
          <p className="text-[12px] font-semibold leading-tight text-slate">Happy Hour</p>
          <p className="text-[8px] text-slate/70">4PM - 7PM</p>
          <p className="mt-1.5 text-[11px] font-semibold text-slate">50% OFF</p>
          <p className="text-[8px] text-slate/70">Selected Cocktails</p>
          <button type="button" className="mt-2 rounded-full bg-slate px-2 py-0.5 text-[7px] font-semibold text-oat">
            Order Now
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white p-2 ring-1 ring-umber-soft/30">
            <p className="text-[7px] font-semibold text-slate">Business Lunch</p>
            <p className="text-[10px] font-semibold text-slate">$12.90</p>
            <p className="text-[6px] text-slate/55">Mon - Fri</p>
          </div>
          <div className="rounded-lg bg-white p-2 ring-1 ring-umber-soft/30">
            <p className="text-[7px] font-semibold text-slate">New Dish</p>
            <p className="text-[7px] text-slate">Truffle Risotto</p>
            <button type="button" className="mt-1 rounded bg-slate px-1 py-0.5 text-[6px] font-semibold text-oat">
              Order Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpotlightPos() {
  // POS terminal on a styled wooden counter, intended to read like a real
  // photograph until a real screenshot is dropped into
  // public/landing/features/pos-integration.{png,jpg,jpeg,webp}.
  const rows = [
    { item: "Truffle Pasta",  qty: "Add", price: "$24.00" },
    { item: "Burrata Salad",  qty: "Add", price: "$14.00" },
    { item: "Lemonade",       qty: "Add", price: "$3.00"  },
    { item: "Grilled Salmon", qty: "Add", price: "$28.00" },
  ];
  return (
    <div
      className="relative flex h-full w-full items-end justify-end overflow-hidden"
      style={{
        background:
          // Soft cream wall + a warm wood-counter band at the bottom — same
          // palette feel as the other spotlight backgrounds (linen / sage),
          // tilted toward warmer cafe tones for the POS scene.
          "linear-gradient(180deg, rgba(247, 245, 242, 1) 0%, rgba(247, 245, 242, 1) 58%, rgba(183, 163, 154, 0.55) 58%, rgba(123, 92, 70, 0.55) 100%), radial-gradient(40% 40% at 80% 20%, rgba(199, 214, 207, 0.35) 0%, rgba(247, 245, 242, 0) 70%)",
      }}
    >
      {/* Soft plant silhouette in the back corner, mirrors the qr-orders
          composition. Pure CSS, no asset. */}
      <span
        aria-hidden
        className="absolute right-4 top-4 h-16 w-16 rounded-full bg-sea-soft/60 blur-md"
      />

      {/* POS rig: terminal + stand + base, sitting on the wood band */}
      <div className="relative mx-auto mb-4 flex w-[78%] max-w-[280px] flex-col items-center">
        {/* Terminal bezel */}
        <div
          className="w-full rounded-[14px] bg-slate p-2"
          style={{ boxShadow: "0 18px 36px rgba(35, 33, 48, 0.18), 0 2px 6px rgba(35, 33, 48, 0.12)" }}
        >
          <div className="rounded-[8px] bg-white p-2.5">
            {/* App chrome */}
            <div className="flex items-center justify-between border-b border-slate/8 pb-1.5 text-[7px]">
              <span className="font-semibold text-slate">New Order</span>
              <span className="rounded-full bg-sea-soft/60 px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-wider text-slate/75">
                Table 12
              </span>
            </div>

            {/* Order rows — quantity + name + price */}
            <ul className="mt-2 space-y-1">
              {rows.map((r) => (
                <li
                  key={r.item}
                  className="flex items-center justify-between rounded-md bg-oat px-1.5 py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-chartreuse/70 text-[6px] font-semibold text-slate"
                    >
                      +
                    </span>
                    <span className="text-[7px] font-semibold text-slate">{r.item}</span>
                  </span>
                  <span className="text-[7px] font-mono tabular-nums text-slate">{r.price}</span>
                </li>
              ))}
            </ul>

            {/* Subtotal strip */}
            <div className="mt-2 flex items-baseline justify-between border-t border-slate/8 pt-1.5 text-[7px]">
              <span className="font-semibold text-slate">Subtotal</span>
              <span className="font-mono tabular-nums font-semibold text-slate">$69.00</span>
            </div>

            <button
              type="button"
              className="mt-2 w-full rounded-md bg-slate py-1.5 text-[7px] font-semibold text-oat"
            >
              Send to kitchen
            </button>
          </div>
        </div>

        {/* Hinge between terminal and stand */}
        <div aria-hidden className="mt-1 h-1.5 w-10 rounded-b bg-slate/85" />

        {/* Stand neck */}
        <div
          aria-hidden
          className="mt-0.5 h-3 w-3 rounded-sm bg-slate/85"
          style={{ boxShadow: "0 6px 12px rgba(35, 33, 48, 0.12)" }}
        />

        {/* Base footprint on the counter */}
        <div
          aria-hidden
          className="h-1.5 w-20 rounded-full bg-slate"
          style={{ boxShadow: "0 8px 14px rgba(35, 33, 48, 0.18)" }}
        />
      </div>

      {/* "Real-time sync" status pill — visual cue that POS and TabCall are
          two-way connected. Sits in the empty cream area to balance the
          composition. */}
      <span className="absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-[8px] font-medium text-slate/75 shadow-card ring-1 ring-umber-soft/30">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sea" />
        Synced with Toast · just now
      </span>
    </div>
  );
}

function SpotlightIcon({ slug }: { slug: string }) {
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

/* ---------------------------------------------------------------------- */
/* How TabCall works (compact summary; full page at /how-it-works)         */
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

              <Link
                href="/how-it-works"
                className="mt-7 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate hover:text-umber"
              >
                See the full flow <span aria-hidden>→</span>
              </Link>
            </div>

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
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chartreuse/60 text-slate">
                  <PlateIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-slate">{it.name}</p>
                  <p className="text-[9px] text-slate/55">{it.sub}</p>
                </div>
                <span className="text-[10px] font-semibold text-slate">{it.price}</span>
                <button type="button" className="rounded-full bg-slate px-2.5 py-1 text-[9px] font-semibold text-oat">
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
/* Metrics                                                                */
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
                <span aria-hidden className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-slate ring-1 ring-white">
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
                <li className="inline-flex items-center gap-1.5"><CheckDot /> Free 14-day trial</li>
                <li className="inline-flex items-center gap-1.5"><CheckDot /> No credit card required</li>
                <li className="inline-flex items-center gap-1.5"><CheckDot /> Setup in minutes</li>
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
    <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-chartreuse text-slate">
      <svg width="9" height="9" viewBox="0 0 12 12">
        <path d="M2.5 6.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
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
      <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-tight text-slate md:text-[36px] lg:text-[40px]">
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
/* Icons used in the hero phone mockup + feature shortcuts                */
/* ---------------------------------------------------------------------- */

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ForkKnifeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3v8a2 2 0 0 0 2 2v8" />
      <path d="M5 3v6a2 2 0 0 0 2 2" />
      <path d="M11 3v6a2 2 0 0 1-2 2" />
      <path d="M17 3c-1.5 0-3 1.5-3 4v5a2 2 0 0 0 2 2h1v7" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.7 1.6 6.8L12 17l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
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
