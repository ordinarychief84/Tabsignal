/**
 * TabCall, landing page.
 *
 * Visual language inspired by nory.ai's editorial pacing:
 *  - dark hero with a huge headline + floating product mockups
 *  - trust strip of brand cards on cream
 *  - big-stat row with vertical dividers ("Results you can take to the bank")
 *  - two-up feature cards with embedded UI fragments
 *  - massive bold sentence as a lead-in to CTA bands
 *
 * Brand palette (use ONLY these, see tailwind.config.ts):
 *   slate     #0E0F1A   dark surfaces, navbar, hero, footer
 *   slate.light #1A1C2C cards over slate
 *   oat       #F8F6F1   light surfaces
 *   chartreuse #C9F61C  primary action + active signals
 *   coral     #F25C42   alerts + delays
 *   sea       #5BD0B3   secondary accents
 *   umber     #8B6F4E   warm CTA / divider accent
 *
 * Section rule: a single section uses one accent at most. No gradients.
 *
 * Copy rule: no em dashes. Use comma, period, parens, or colon.
 */

import Link from "next/link";

export default function Landing() {
  return (
    <>
      <Navbar />
      <Hero />
      <TrustStrip />
      <SectionTitle />
      <ResultsBand />
      <OnePlatform />
      <TwoUpFeatures />
      <HowItWorks />
      <Pricing />
      <Faq />
      <CtaBand />
      <Footer />
    </>
  );
}

/* ------------------------------ logo ------------------------------- */

function Logo({
  variant = "light",
  iconOnly = false,
}: {
  variant?: "light" | "dark";
  iconOnly?: boolean;
}) {
  const wordColor = variant === "light" ? "#FFFFFF" : "#0E0F1A";
  return (
    <span className="inline-flex items-center gap-2 leading-none">
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M 6 11 Q 12 6, 18 11"
            fill="none"
            stroke="#C9F61C"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="16" r="2" fill="#C9F61C" />
        </svg>
      </span>
      {iconOnly ? null : (
        <span
          className="text-lg font-semibold tracking-tight"
          style={{ color: wordColor }}
        >
          TabCall
        </span>
      )}
    </span>
  );
}

/* ------------------------------ navbar ----------------------------- */

/**
 * Product dropdown groups. Every item links to #product on the landing page
 * because feature subsections are not yet split into their own routes. When
 * deeper pages ship, swap the href here. Labels are the canonical names used
 * in marketing copy and in the footer.
 */
const PRODUCT_GROUPS: { title: string; items: { label: string; href: string }[] }[] = [
  {
    title: "Guest at the table",
    items: [
      { label: "Call waiter", href: "#product" },
      { label: "Pay the bill", href: "#product" },
      { label: "Split a bill", href: "#product" },
      { label: "Pre-order from QR", href: "#product" },
      { label: "Save a wishlist", href: "#product" },
      { label: "Reservations and waitlist", href: "#product" },
      { label: "Reviews and ratings", href: "#product" },
    ],
  },
  {
    title: "Staff and managers",
    items: [
      { label: "Live queue (live request feed)", href: "#product" },
      { label: "Push notifications", href: "#product" },
      { label: "Manager dashboard", href: "#product" },
      { label: "Reviews inbox", href: "#product" },
      { label: "Order and bill view", href: "#product" },
    ],
  },
  {
    title: "Owner and admin",
    items: [
      { label: "Branding (logo, banner, colors)", href: "#product" },
      { label: "Promotions and banners", href: "#product" },
      { label: "Staff and roles", href: "#product" },
      { label: "QR codes and tables", href: "#product" },
      { label: "Tip pool", href: "#product" },
      { label: "POS integration (preview)", href: "#product" },
      { label: "Loyalty regulars", href: "#product" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Multi-location console", href: "#product" },
      { label: "Cross-venue benchmarks", href: "#product" },
      { label: "Audit log", href: "#product" },
      { label: "Security dashboard", href: "#product" },
    ],
  },
];

function ProductDropdown() {
  // Pure CSS dropdown. The wrapper is `group`; the button keeps aria-expanded
  // wired through CSS so screen readers see the change on focus-within.
  return (
    <div className="group relative">
      <button
        type="button"
        aria-expanded="false"
        aria-haspopup="true"
        className="inline-flex items-center gap-1 text-sm text-oat/80 transition-colors hover:text-oat focus:text-oat focus:outline-none group-focus-within:text-oat group-hover:text-oat"
      >
        Product
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 12 12"
          className="transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
        >
          <path
            d="M2 4l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Hover bridge: keeps the panel open while moving cursor down. */}
      <div
        aria-hidden
        className="pointer-events-none invisible absolute left-0 right-0 top-full h-3 group-hover:pointer-events-auto group-hover:visible group-focus-within:pointer-events-auto group-focus-within:visible"
      />

      <div
        role="menu"
        className="invisible absolute left-1/2 top-[calc(100%+0.75rem)] z-40 w-[min(960px,90vw)] -translate-x-1/2 translate-y-1 rounded-2xl bg-white p-8 opacity-0 shadow-2xl ring-1 ring-slate/10 transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
          {PRODUCT_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
                {group.title}
              </p>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      role="menuitem"
                      className="block rounded-md px-2 py-1 text-[13px] leading-snug text-slate/80 transition-colors hover:bg-oat hover:text-slate"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-light/40 bg-slate/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo variant="light" />
        <nav className="hidden items-center gap-8 text-sm text-oat/80 md:flex">
          <ProductDropdown />
          <a href="#how" className="hover:text-oat">How it works</a>
          <a href="#pricing" className="hover:text-oat">Pricing</a>
          <Link href="/staff/login" className="hover:text-oat">Login</Link>
        </nav>
        {/* Mobile: dropdown collapses to a plain anchor that scrolls to #product. */}
        <nav className="flex items-center gap-5 text-sm text-oat/80 md:hidden">
          <a href="#product" className="hover:text-oat">Product</a>
          <a href="#pricing" className="hover:text-oat">Pricing</a>
        </nav>
        <Link
          href="/signup"
          className="rounded-full bg-oat px-5 py-2 text-sm font-medium text-slate transition-colors hover:bg-oat/90"
        >
          Start free
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------ hero ------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 md:grid-cols-[1.05fr_1fr] md:py-28 lg:py-32">
        {/* LEFT, headline column */}
        <div className="text-oat">
          <span className="inline-flex items-center gap-2 rounded-full border border-oat/15 bg-slate-light/60 px-3.5 py-1.5 text-[12px] text-oat/80">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-chartreuse text-[10px] font-bold text-slate">
              ★
            </span>
            4.8 from Houston operators. No ad budget, just word of mouth.
          </span>

          <h1 className="mt-6 text-[52px] font-semibold leading-[0.95] tracking-[-0.025em] text-oat md:text-[72px] lg:text-[88px]">
            <span className="block">The 1-star review</span>
            <span className="block text-chartreuse">that never went public.</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-oat/70">
            TabCall sits on top of your POS. Guests scan a QR. The closest
            server&rsquo;s phone buzzes. And the second a bad rating is
            brewing, our AI routes it to your inbox instead of Google.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-chartreuse px-6 py-3.5 text-[15px] font-semibold text-slate transition-colors hover:bg-chartreuse/90"
            >
              Start free
            </Link>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-oat/15 bg-transparent px-6 py-3.5 text-[15px] font-medium text-oat transition-colors hover:bg-oat/5"
            >
              <span
                aria-hidden
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-oat/10"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M2 1l5 3.5L2 8V1z" fill="#F8F6F1" />
                </svg>
              </span>
              See how it works
            </a>
          </div>

          <p className="mt-5 text-[12px] text-oat/45">
            Free Starter plan. No card to start. Cancel by text.
          </p>
        </div>

        {/* RIGHT, layered hero mockup */}
        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Floating tag, top-left */}
      <div className="absolute -left-2 top-3 z-20 inline-flex items-center gap-2 rounded-full bg-slate-light/95 px-3 py-1.5 text-[11px] text-oat/85 ring-1 ring-white/10 backdrop-blur md:-left-8">
        <span className="h-1.5 w-1.5 rounded-full bg-sea" />
        Live floor, Otto&rsquo;s Lounge
      </div>

      {/* Email card, main */}
      <div className="rounded-3xl bg-slate-light p-6 shadow-2xl ring-1 ring-white/5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] text-oat/50">
            From: alerts@tab-call.com
          </p>
          <span className="font-mono text-[11px] text-oat/40">10:14 PM</span>
        </div>

        <p className="mt-4 text-[15px] font-medium text-oat">
          Table 7 · 2 stars
        </p>

        <p className="mt-3 border-l-2 border-coral/50 pl-4 text-sm italic leading-relaxed text-oat/70">
          &ldquo;Waited 8 min for second drink, server seemed annoyed when I
          asked again.&rdquo;
        </p>

        <div className="mt-5 space-y-2 text-sm">
          <Row k="Likely cause" v="Service speed" />
          <Row k="Server on table" v="Marcus" />
          <Row k="Suggested" v="Comp the next round. Talk to Marcus before close." last />
        </div>

        <p className="mt-5 inline-flex items-center gap-2 text-[11px] tracking-wide text-oat/45">
          <span className="h-1.5 w-1.5 rounded-full bg-chartreuse" />
          Routed privately. We never email the guest.
        </p>
      </div>

      {/* Floating "0% public" badge, bottom-right */}
      <div className="absolute -bottom-5 right-2 z-20 flex items-center gap-3 rounded-2xl bg-oat px-4 py-3 text-slate shadow-xl ring-1 ring-slate/5 md:-right-8">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-chartreuse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l5 5L20 7"
              stroke="#0E0F1A"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate/55">
            1★ this week
          </p>
          <p className="text-base font-semibold">3 caught · 0 public</p>
        </div>
      </div>

      {/* Floating "live request" pill, top-right */}
      <div className="absolute -right-3 top-20 z-20 hidden rounded-2xl bg-oat px-4 py-3 text-slate shadow-xl ring-1 ring-slate/5 md:-right-12 md:block">
        <p className="text-[10px] uppercase tracking-[0.16em] text-slate/55">
          Avg bill close
        </p>
        <p className="mt-0.5 text-2xl font-semibold leading-none">
          1<span className="text-base font-medium text-slate/55">m</span>32
          <span className="text-base font-medium text-slate/55">s</span>
        </p>
        <p className="mt-1 text-[10px] text-sea">↓ 84% vs paper tab</p>
      </div>
    </div>
  );
}

function Row({ k, v, last = false }: { k: string; v: string; last?: boolean }) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-4",
        last ? "" : "border-b border-white/5 pb-2",
      ].join(" ")}
    >
      <span className="text-[11px] uppercase tracking-[0.16em] text-oat/40">{k}</span>
      <span className="text-right text-sm text-oat">{v}</span>
    </div>
  );
}

/* ------------------------- trust strip ----------------------------- */

function TrustStrip() {
  // Real Houston-flavoured venue names placed as wordmarks. When real partner
  // logos arrive, swap each tile for an <Image>.
  const tiles = [
    { name: "Otto's Lounge", style: "italic" },
    { name: "Bar Reyna", style: "uppercase" },
    { name: "Anvil", style: "tracking-[0.3em]" },
    { name: "Captain Foxheart's", style: "italic" },
    { name: "Better Luck", style: "uppercase" },
    { name: "Tongue-Cut Sparrow", style: "tracking-[0.3em]" },
    { name: "Rudyard's", style: "italic" },
    { name: "Notsuoh", style: "uppercase" },
  ];
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-20 text-center md:pt-24">
        <h2 className="mx-auto max-w-3xl text-[34px] font-semibold leading-[1.05] tracking-tight text-slate md:text-[52px]">
          Trusted by the rooms that get loud after 10.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate/65">
          Houston bars and lounges that don&rsquo;t want a new POS. They want
          their floor to move faster.
        </p>

        <div className="mx-auto mt-12 grid max-w-6xl grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <div
              key={t.name}
              className="flex h-20 items-center justify-center rounded-2xl bg-white px-4 ring-1 ring-slate/5"
            >
              <span
                className={`text-base font-semibold text-slate/70 ${t.style ?? ""}`}
              >
                {t.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------- centered section title --------------------- */

function SectionTitle() {
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
          Why bars switch
        </p>
        <h2 className="mt-5 text-[40px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[64px]">
          Why operators run TabCall.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate/65">
          We don&rsquo;t replace your POS, your printer, or your menu. We sit
          on top, and free your floor to do what it&rsquo;s actually there for:
          serve faster, save the rating, hold the regular.
        </p>
        <a
          href="#product"
          className="mt-8 inline-flex items-center gap-2 rounded-full border border-slate/20 bg-white px-6 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/40"
        >
          See the product
          <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  );
}

/* ------------------ results-you-can-take-to-the-bank --------------- */

function ResultsBand() {
  const stats = [
    {
      tag: "Bad-rating intercept",
      dot: "bg-coral",
      value: "3×",
      label: "Fewer 1-star reviews landing on Google",
    },
    {
      tag: "Floor speed",
      dot: "bg-sea",
      value: "1m 32s",
      label: "Average bill close vs 8m on a paper tab",
    },
    {
      tag: "Tip lift",
      dot: "bg-chartreuse",
      value: "+1.3%",
      label: "Digital vs paper tip percentage, by server",
    },
  ];
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-20 md:pb-28">
        <h2 className="mx-auto max-w-3xl text-center text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[56px]">
          Results you can take to the bank.
        </h2>

        <div className="mt-16 grid grid-cols-1 gap-y-12 md:grid-cols-3 md:gap-y-0">
          {stats.map((s, i) => (
            <div
              key={s.tag}
              className={[
                "px-2 text-center md:px-8",
                i > 0 ? "md:border-l md:border-slate/10" : "",
              ].join(" ")}
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-medium text-slate ring-1 ring-slate/5">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                {s.tag}
              </span>
              <p className="mt-8 text-[72px] font-semibold leading-[0.9] tracking-[-0.02em] text-slate md:text-[96px]">
                {s.value}
              </p>
              <p className="mx-auto mt-6 max-w-[220px] text-sm leading-relaxed text-slate/65">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-20 max-w-4xl text-center text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[56px]">
          Thicken up the thinnest of margins.
        </p>
      </div>
    </section>
  );
}

/* -------------------- the power of one platform -------------------- */

function OnePlatform() {
  return (
    <section id="product" className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-24">
        <div className="overflow-hidden rounded-[32px] bg-white p-8 ring-1 ring-slate/5 md:p-14">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Left, copy */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
                One feed
              </p>
              <h3 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[48px]">
                One quiet feed. Every signal.
              </h3>
              <p className="mt-5 max-w-md text-base leading-relaxed text-slate/65">
                Every table, every signal, every server, ranked by age and
                urgency. A request that has been waiting 3 minutes turns coral
                on the PWA before the guest ever raises a hand.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "Live request queue on a PWA, sub-second routing",
                  "Acknowledge, hand off, resolve with a reason code",
                  "Push notifications when the PWA is backgrounded (FCM)",
                  "Bill view, kitchen view, reservations, waitlist, tip pool",
                  "Manager dashboard: response time, completion, peak hours",
                ].map((b) => (
                  <li key={b} className="flex gap-3 text-[15px] text-slate/80">
                    <span
                      aria-hidden
                      className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-chartreuse"
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right, venue stat panel */}
            <VenuePanelMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function VenuePanelMock() {
  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="rounded-3xl bg-oat p-6 ring-1 ring-slate/5">
        {/* Location pill */}
        <div className="inline-flex items-center gap-2 rounded-2xl bg-sea/30 px-4 py-2.5 text-[13px] font-semibold text-slate">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 2C8 2 5 5 5 9c0 5.5 7 13 7 13s7-7.5 7-13c0-4-3-7-7-7z"
              stroke="#0E0F1A"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="9" r="2.2" fill="#0E0F1A" />
          </svg>
          Otto&rsquo;s Lounge, Houston
        </div>

        {/* Sales card */}
        <div className="mt-4 rounded-2xl bg-white p-5 ring-1 ring-slate/5">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-slate/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate/70">
              Tabs
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-chartreuse">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M7 17L17 7M17 7H9M17 7v8" stroke="#0E0F1A" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          </div>
          <p className="mt-4 text-[26px] font-semibold leading-none text-slate">
            $4,712.40
          </p>
          <p className="mt-1 text-xs text-slate/55">
            Friday · 21:42 · 47 served
          </p>
        </div>

        {/* Rating intercept card */}
        <div className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate/5">
          <div className="flex items-center justify-between">
            <span className="rounded-lg bg-slate/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate/70">
              1★ caught
            </span>
            <span className="rounded-full bg-coral/15 px-2.5 py-1 text-[11px] font-semibold text-coral">
              ↗ −67%
            </span>
          </div>
          <p className="mt-4 text-[26px] font-semibold leading-none text-slate">
            3<span className="text-base font-medium text-slate/55"> /4</span>
          </p>
          <p className="mt-1 text-xs text-slate/55">
            Routed to you before going public
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- two-up feature cards ----------------------- */

function TwoUpFeatures() {
  return (
    <section className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-2">
          <FeatureCard
            tag="AI intercept"
            title="Save the bad review for your inbox."
            body="After paying, every guest sees a star prompt. 4 to 5 stars route to Google. 1 to 3 stars route to you with an AI category (service speed, drink quality, staff attitude, wait time, food, noise) plus the table, the server, and a suggested action."
          >
            <NotificationStack />
          </FeatureCard>

          <FeatureCard
            tag="Plays nice"
            title="Sits on top of what you already pay for."
            body="Stripe Connect for payments. A POS integration layer with providers planned for Toast, Square, and Clover. Apple Pay, Google Pay, card. No rip-out, no menu rebuild, no printer chain to redo."
          >
            <IntegrationOrbit />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  body,
  children,
}: {
  tag: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-8 rounded-[32px] bg-white p-8 ring-1 ring-slate/5 md:p-10">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
          {tag}
        </p>
        <h3 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-tight text-slate md:text-[34px]">
          {title}
        </h3>
        <p className="mt-4 max-w-md text-base leading-relaxed text-slate/65">
          {body}
        </p>
      </div>
      <div className="mt-auto rounded-3xl bg-oat p-6 md:p-8">{children}</div>
    </article>
  );
}

function NotificationStack() {
  const items = [
    {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z"
            fill="#0E0F1A"
          />
        </svg>
      ),
      bg: "bg-coral/20",
      label: "Table 7 · 2★ before posting",
    },
    {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="#0E0F1A" strokeWidth="1.8" />
          <path d="M12 7v5l3 2" stroke="#0E0F1A" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      bg: "bg-sea/30",
      label: "Bar 2 · waited 4:12, escalate",
    },
    {
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 12h18M12 3v18" stroke="#0E0F1A" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      bg: "bg-chartreuse/40",
      label: "Marcus, 2nd flag this shift",
    },
  ];
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-3 rounded-2xl bg-white p-3 pr-4 ring-1 ring-slate/5"
        >
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${it.bg}`}
          >
            {it.icon}
          </span>
          <span className="text-[14px] font-medium text-slate">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function IntegrationOrbit() {
  // 8 satellite tiles + 1 centre brand tile arranged on a 3-row grid.
  const tiles: { label: string; tone: "white" | "sea" | "chartreuse" | "coral" | "umber" }[] = [
    { label: "Toast", tone: "white" },
    { label: "Square", tone: "sea" },
    { label: "Stripe", tone: "white" },
    { label: "Apple Pay", tone: "umber" },
    { label: "·", tone: "white" }, // brand center placeholder, replaced below
    { label: "Google Pay", tone: "chartreuse" },
    { label: "Clover", tone: "white" },
    { label: "Google", tone: "coral" },
    { label: "FCM Push", tone: "white" },
  ];
  const tone = (t: string) => {
    switch (t) {
      case "sea":        return "bg-sea/30";
      case "chartreuse": return "bg-chartreuse/40";
      case "coral":      return "bg-coral/15";
      case "umber":      return "bg-umber/20";
      default:           return "bg-white";
    }
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t, i) => {
        if (i === 4) {
          // Centre brand tile
          return (
            <div
              key={i}
              className="flex aspect-square items-center justify-center rounded-2xl bg-slate text-chartreuse ring-1 ring-slate/10"
            >
              <span className="text-base font-semibold lowercase tracking-tight">
                tabcall
              </span>
            </div>
          );
        }
        return (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-2xl text-center text-[12px] font-semibold text-slate/85 ring-1 ring-slate/5 ${tone(t.tone)}`}
          >
            {t.label}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ how it works ----------------------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      tone: "bg-sea/30",
      title: "Guest scans. Closest server’s phone buzzes.",
      body:
        "Four buttons at the table: call waiter, request bill, ask for a refill, ask for help. No app to download. Sub-second delivery to the staff PWA. If nobody acknowledges in 3 minutes, the request turns coral and escalates.",
    },
    {
      n: "02",
      tone: "bg-chartreuse/30",
      title: "Bill closes from the table. No card data stored.",
      body:
        "Stripe Connect, Apple Pay, Google Pay, card. Split by item or by share, two guests can pay different items without colliding. Pre-order from the QR menu before getting seated, pickup code on confirmation.",
    },
    {
      n: "03",
      tone: "bg-coral/20",
      title: "1 to 3 stars? It comes to you. Not Google.",
      body:
        "Every guest rates after paying. 4 and 5 stars get nudged to your Google profile. 1 to 3 stars route to the manager with an AI-classified category: service speed, drink quality, staff attitude, wait time, food, or noise.",
    },
  ];
  return (
    <section id="how" className="bg-slate">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-chartreuse/80">
            How it works
          </p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-tight text-oat md:text-[60px]">
            Three steps, scan to served.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <article
              key={s.n}
              className="rounded-3xl bg-slate-light p-8 ring-1 ring-white/5"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold text-slate ${s.tone}`}
                >
                  {s.n}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-oat/40">
                  Step {Number(s.n)}
                </span>
              </div>
              <h3 className="mt-7 text-[22px] font-semibold leading-snug text-oat">
                {s.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-oat/70">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ pricing ---------------------------- */

/**
 * Tier columns drive both the top cards and the matrix header. Order matters:
 * Starter, Growth, Pro, Founding. `key` is the lookup used by feature rows.
 */
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
    tagline: "Full menu, pre-orders, splits, tip pool, reservations, waitlist, analytics.",
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
    tagline: "Loyalty, promotions, branding, benchmarks, multi-location, POS layer.",
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
    tagline: "Everything in Pro, plus a TabCall-managed setup and a dedicated Slack channel.",
    trial: false,
    cta: "Talk to us",
    ctaHref: "mailto:hello@tab-call.com",
    highlight: false,
  },
];

type TierKey = (typeof PRICING_TIERS)[number]["key"];

const MATRIX_GROUPS: {
  title: string;
  rows: { label: string; tiers: TierKey[] }[];
}[] = [
  {
    title: "Guest table flow",
    rows: [
      { label: "Call waiter", tiers: ["starter", "growth", "pro", "founding"] },
      { label: "Request bill", tiers: ["starter", "growth", "pro", "founding"] },
      { label: "Pay from QR", tiers: ["starter", "growth", "pro", "founding"] },
      { label: "Split bill", tiers: ["growth", "pro", "founding"] },
      { label: "Pre-order", tiers: ["growth", "pro", "founding"] },
      { label: "Wishlist", tiers: ["growth", "pro", "founding"] },
      { label: "Reservations", tiers: ["growth", "pro", "founding"] },
      { label: "Waitlist", tiers: ["growth", "pro", "founding"] },
      { label: "Reviews", tiers: ["starter", "growth", "pro", "founding"] },
    ],
  },
  {
    title: "Staff tools",
    rows: [
      { label: "Live queue PWA", tiers: ["starter", "growth", "pro", "founding"] },
      { label: "Push notifications", tiers: ["starter", "growth", "pro", "founding"] },
      { label: "Auto-escalation", tiers: ["growth", "pro", "founding"] },
      { label: "Hand off requests", tiers: ["growth", "pro", "founding"] },
      { label: "Resolution reasons", tiers: ["growth", "pro", "founding"] },
    ],
  },
  {
    title: "Manager dashboard",
    rows: [
      { label: "Response time", tiers: ["growth", "pro", "founding"] },
      { label: "Completion time", tiers: ["growth", "pro", "founding"] },
      { label: "Peak hours", tiers: ["growth", "pro", "founding"] },
      { label: "Staff performance", tiers: ["growth", "pro", "founding"] },
      { label: "Audit log", tiers: ["pro", "founding"] },
    ],
  },
  {
    title: "Menu and ordering",
    rows: [
      { label: "Categories", tiers: ["growth", "pro", "founding"] },
      { label: "Featured items", tiers: ["growth", "pro", "founding"] },
      { label: "Image upload", tiers: ["growth", "pro", "founding"] },
      { label: "Order state machine", tiers: ["growth", "pro", "founding"] },
      { label: "Tip pool", tiers: ["growth", "pro", "founding"] },
    ],
  },
  {
    title: "Promotions",
    rows: [
      { label: "Happy hour", tiers: ["pro", "founding"] },
      { label: "Banner", tiers: ["pro", "founding"] },
      { label: "Business lunch", tiers: ["pro", "founding"] },
      { label: "Limited time", tiers: ["pro", "founding"] },
      { label: "New item", tiers: ["pro", "founding"] },
      { label: "Discount highlight", tiers: ["pro", "founding"] },
    ],
  },
  {
    title: "Loyalty",
    rows: [
      { label: "Returning guest identify", tiers: ["pro", "founding"] },
      { label: "Per-venue points", tiers: ["pro", "founding"] },
      { label: "Visit history", tiers: ["pro", "founding"] },
    ],
  },
  {
    title: "Branding",
    rows: [
      { label: "Logo", tiers: ["pro", "founding"] },
      { label: "Banner image", tiers: ["pro", "founding"] },
      { label: "Brand colors", tiers: ["pro", "founding"] },
      { label: "Font selection", tiers: ["pro", "founding"] },
      { label: "Welcome message", tiers: ["pro", "founding"] },
      { label: "Review prompt", tiers: ["pro", "founding"] },
    ],
  },
  {
    title: "POS",
    rows: [
      { label: "Toast (preview)", tiers: ["pro", "founding"] },
      { label: "Square (preview)", tiers: ["pro", "founding"] },
      { label: "Clover (preview)", tiers: ["pro", "founding"] },
    ],
  },
  {
    title: "Platform",
    rows: [
      { label: "Multi-location operator", tiers: ["pro", "founding"] },
      { label: "Cross-venue benchmarks (k>=5)", tiers: ["pro", "founding"] },
      { label: "Impersonation audit", tiers: ["pro", "founding"] },
      { label: "Security dashboard", tiers: ["pro", "founding"] },
    ],
  },
  {
    title: "Support",
    rows: [
      { label: "Email response time", tiers: ["starter", "growth", "pro", "founding"] },
      { label: "Concierge onboarding", tiers: ["founding"] },
    ],
  },
];

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="text-slate"
    >
      <circle cx="7" cy="7" r="7" fill="#C9F61C" />
      <path
        d="M3.8 7.2l2.2 2.2 4.2-4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AbsentDot() {
  return (
    <span
      aria-hidden
      className="inline-block h-1.5 w-1.5 rounded-full bg-slate/30"
    />
  );
}

function Pricing() {
  return (
    <section id="pricing" className="bg-oat">
      <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
            Pricing
          </p>
          <h2 className="mt-4 text-[40px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[60px]">
            Pick the plan that matches the floor.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate/65">
            Starter is free at 5 tables. Growth and Pro: start free, pay
            nothing for 14 days, cancel anytime, no card needed to start.
            Founding is concierge only.
          </p>
        </div>

        {/* Tier cards */}
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((t) => (
            <article
              key={t.key}
              className={[
                "flex flex-col rounded-3xl p-7",
                t.highlight
                  ? "bg-slate text-oat ring-1 ring-slate"
                  : "bg-white text-slate ring-1 ring-slate/10",
              ].join(" ")}
            >
              {t.trial ? (
                <span className="inline-flex w-fit items-center rounded-full bg-chartreuse px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate">
                  14-day free trial. No card to start.
                </span>
              ) : (
                <span className="inline-block h-[22px]" aria-hidden />
              )}

              <h3 className="mt-4 text-xl font-semibold">{t.name}</h3>

              <p
                className={[
                  "mt-4 text-[40px] font-semibold leading-none tracking-tight",
                  t.highlight ? "text-oat" : "text-slate",
                ].join(" ")}
              >
                {t.price}
              </p>
              <p
                className={[
                  "mt-1 text-xs",
                  t.highlight ? "text-oat/55" : "text-slate/55",
                ].join(" ")}
              >
                {t.sub}
              </p>

              <p
                className={[
                  "mt-4 text-sm leading-relaxed",
                  t.highlight ? "text-oat/70" : "text-slate/70",
                ].join(" ")}
              >
                {t.tagline}
              </p>

              <Link
                href={t.ctaHref}
                className={[
                  "mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-colors",
                  t.highlight
                    ? "bg-chartreuse text-slate hover:bg-chartreuse/90"
                    : "bg-slate text-oat hover:bg-slate/90",
                ].join(" ")}
              >
                {t.cta}
              </Link>
            </article>
          ))}
        </div>

        {/* Feature matrix */}
        <div className="mt-16 overflow-hidden rounded-3xl bg-white ring-1 ring-slate/10">
          {/* Sticky tier header row */}
          <div
            className="sticky top-16 z-10 grid items-center gap-2 border-b border-slate/10 bg-white px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate/60"
            style={{ gridTemplateColumns: "minmax(0,1.6fr) repeat(4, minmax(0,1fr))" }}
          >
            <span>Feature</span>
            {PRICING_TIERS.map((t) => (
              <span key={t.key} className="text-center text-slate">
                {t.name}
              </span>
            ))}
          </div>

          {MATRIX_GROUPS.map((group) => (
            <div key={group.title} className="border-b border-slate/10 last:border-b-0">
              <p className="bg-oat/60 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
                {group.title}
              </p>
              <ul>
                {group.rows.map((row) => (
                  <li
                    key={row.label}
                    className="grid items-center gap-2 border-t border-slate/5 px-6 py-3 text-[14px] text-slate/80 first:border-t-0"
                    style={{ gridTemplateColumns: "minmax(0,1.6fr) repeat(4, minmax(0,1fr))" }}
                  >
                    <span>{row.label}</span>
                    {PRICING_TIERS.map((t) => (
                      <span
                        key={t.key}
                        className="flex items-center justify-center"
                      >
                        {row.tiers.includes(t.key) ? <CheckIcon /> : <AbsentDot />}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate/45">
          Growth and Pro: start free, pay nothing for 14 days, cancel anytime,
          no card needed to start. All plans run month to month. Stripe
          processing (2.9% + 30¢) is passed through at cost.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ faq -------------------------------- */

function Faq() {
  const qs = [
    {
      q: "Do I need to replace my POS?",
      a: "No. TabCall runs on top. We don’t touch your menu, your tax setup, or your printer chain. The POS integration layer has providers planned for Toast, Square, and Clover. If you have no POS, we work standalone.",
    },
    {
      q: "How does the 14-day free trial work?",
      a: "Start free, pay nothing for 14 days, cancel anytime, no card needed to start. Growth and Pro both ship with the trial. On day 15, add a card if you want to keep paid features. If you don’t, you drop to Starter. No auto-charge.",
    },
    {
      q: "How long until we’re live?",
      a: "Starter is self-serve: magic-link sign-in, name your tables (bulk-create works), print the QR tents, finish Stripe Connect onboarding. Most owners are taking real payments inside an hour.",
    },
    {
      q: "What about staff who don’t have phones?",
      a: "Buy an $80 Android off Amazon and clip it behind the bar. The staff PWA installs in one tap, no app store. Push notifications work when the PWA is backgrounded. Most venues run one shared phone for the bar and let servers use their own.",
    },
    {
      q: "Will guests have to download an app?",
      a: "Never. The QR opens a regular webpage. Guests scan, pick a category, pay, and rate. No install, no account. Returning guests can identify by phone number to collect loyalty points per venue.",
    },
    {
      q: "What actually happens to bad reviews?",
      a: "After payment, every guest sees a star prompt. 4 and 5 stars get a one-tap link to your Google profile. 1 to 3 stars stay private: our AI tags it (service speed, drink quality, staff attitude, wait time, food, noise) and routes the table, the server, and a suggested action to the manager. Mark it seen, flag for follow-up, comp the next round.",
    },
    {
      q: "What do staff and managers see?",
      a: "A live queue PWA. Acknowledge a request, hand it off, mark resolved with a reason code. Delayed requests escalate automatically (coral when delayed, chartreuse when active). Managers get a dashboard with response time, completion time, peak hours, and per-server performance. Every staff action is in the audit log.",
    },
    {
      q: "Can I run multiple locations?",
      a: "Yes. Pro and Founding include the multi-org operator console: cross-venue search, anonymized benchmarks (peer group of at least 5), security dashboard, and the ability to impersonate a venue’s staff for support (fully audited).",
    },
    {
      q: "Is my guest data safe?",
      a: "Yes. Guests opt in by phone number only, no name harvesting, no email scraping. Each venue’s data is isolated. We never sell, broker, or train on your floor data. Stripe handles card data, we never see or store it. If you cancel, we hand your data over and delete our copy.",
    },
  ];

  return (
    <section id="faq" className="bg-oat">
      <div className="mx-auto max-w-3xl px-6 pb-24 md:pb-32">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.22em] text-umber">
            FAQ
          </p>
          <h2 className="mt-4 text-[36px] font-semibold leading-[1.02] tracking-tight text-slate md:text-[52px]">
            The questions every owner asks on the call.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-slate/10 rounded-3xl bg-white ring-1 ring-slate/5">
          {qs.map((item) => (
            <details
              key={item.q}
              className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left">
                <span className="text-[15px] font-semibold text-slate">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate/20 text-slate/60 transition-transform group-open:rotate-45"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12">
                    <path
                      d="M6 1v10M1 6h10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-slate/70">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-umber">
          Still have a question?{" "}
          <Link href="/signup" className="underline-offset-4 hover:underline">
            Start free
          </Link>{" "}
          and ask us during setup, or email hello@tab-call.com.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ CTA band --------------------------- */

function CtaBand() {
  return (
    <section className="bg-slate">
      <div className="mx-auto max-w-5xl px-6 py-24 text-center md:py-32">
        <h2 className="text-[44px] font-semibold leading-[0.98] tracking-[-0.02em] text-oat md:text-[80px]">
          Be the bar that gets the email at <span className="text-chartreuse">10:14</span>,
          <br className="hidden md:inline" /> not the public 1-star at <span className="text-coral">10:42</span>.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-base text-oat/70">
          Free Starter plan. Growth $99/mo, Pro $299/mo. Both include a 14-day
          free trial. No card needed to start. Cancel by text.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-chartreuse px-7 py-3.5 text-[15px] font-semibold text-slate transition-colors hover:bg-chartreuse/90"
          >
            Start free
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full border border-oat/15 px-7 py-3.5 text-[15px] font-medium text-oat transition-colors hover:bg-oat/5"
          >
            Talk to us first
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ footer ----------------------------- */

function Footer() {
  return (
    <footer className="bg-slate text-oat/70">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-3">
        <div>
          <Logo variant="light" />
          <p className="mt-4 max-w-xs text-sm text-oat/55">
            Built for the bars that respect the floor. Houston first.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-oat/40">
            Product
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li><a href="#product" className="hover:text-oat">Call waiter</a></li>
            <li><a href="#product" className="hover:text-oat">Pay the bill</a></li>
            <li><a href="#product" className="hover:text-oat">Live queue</a></li>
            <li><a href="#product" className="hover:text-oat">Manager dashboard</a></li>
            <li><a href="#product" className="hover:text-oat">Multi-location console</a></li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-oat/40">
            Contact
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            <li>hello@tab-call.com</li>
            <li>Houston, TX</li>
            <li><Link href="/staff/login" className="hover:text-oat">Staff sign in</Link></li>
            <li><Link href="/terms" className="hover:text-oat">Terms</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-6 py-6 text-xs text-oat/40 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} TabCall.</p>
          <p>Built for restaurants, lounges, and clubs that respect their guests&rsquo; time.</p>
        </div>
      </div>
    </footer>
  );
}
