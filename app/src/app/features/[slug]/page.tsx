import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FEATURES, getFeature } from "@/lib/features-data";
import { MarketingNav, MarketingFooter } from "../../marketing-chrome";

type Params = { params: { slug: string } };

export function generateStaticParams() {
  return FEATURES.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({ params }: Params): Metadata {
  const f = getFeature(params.slug);
  if (!f) return { title: "TabCall · feature" };
  return {
    title: `TabCall · ${f.title}`,
    description: f.tagline,
  };
}

export default function FeatureDetailPage({ params }: Params) {
  const feature = getFeature(params.slug);
  if (!feature) notFound();

  const tone =
    feature.tone === "butter" ? "bg-chartreuse/55" : "bg-sea-soft/70";

  return (
    <main className="bg-oat text-slate">
      <MarketingNav />

      <section className="relative overflow-hidden border-b border-umber-soft/30 bg-oat">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 50% at 80% 20%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(40% 40% at 10% 90%, rgba(242, 231, 183, 0.28) 0%, rgba(247, 245, 242, 0) 65%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
          <Link
            href="/features"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-umber transition-colors hover:text-slate"
          >
            <span aria-hidden>←</span> All features
          </Link>

          <div className="mt-6 grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-xl text-slate ${tone}`}
                aria-hidden
              >
                <FeatureIcon slug={feature.slug} />
              </span>
              <h1 className="mt-6 text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] text-slate md:text-[44px] lg:text-[52px]">
                {feature.title}
              </h1>
              <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-slate/70">
                {feature.tagline}
              </p>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-slate/65">
                {feature.detailLead}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full bg-chartreuse px-5 py-3 text-sm font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  Get Started Free
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center justify-center rounded-full border border-umber-soft/50 bg-white px-5 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/30"
                >
                  See how it works
                </Link>
              </div>
            </div>

            <FeaturePreview slug={feature.slug} />
          </div>
        </div>
      </section>

      <section className="bg-oat py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-2 md:gap-12 md:px-8">
          <div className="rounded-2xl border border-umber-soft/30 bg-white p-7 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
              What you get
            </p>
            <ul className="mt-5 space-y-3.5">
              {feature.highlights.map((h) => (
                <li key={h} className="flex gap-3 text-[14px] leading-relaxed text-slate/80">
                  <CheckPill /> <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-umber-soft/30 bg-white p-7 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-umber">
              How it shows up on the floor
            </p>
            <ul className="mt-5 space-y-3.5">
              {feature.outcomes.map((o) => (
                <li key={o} className="flex gap-3 text-[14px] leading-relaxed text-slate/80">
                  <ArrowDot /> <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <RelatedFeatures currentSlug={feature.slug} />

      <FinalCtaBlock />

      <MarketingFooter />
    </main>
  );
}

function CheckPill() {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-chartreuse text-slate"
    >
      <svg width="10" height="10" viewBox="0 0 12 12">
        <path
          d="M2.5 6.2l2.4 2.4 4.6-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ArrowDot() {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sea-soft/60 text-slate"
    >
      <svg width="10" height="10" viewBox="0 0 12 12">
        <path d="M3 6h6m-3-3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function RelatedFeatures({ currentSlug }: { currentSlug: string }) {
  const others = FEATURES.filter((f) => f.slug !== currentSlug).slice(0, 3);
  return (
    <section className="bg-oat pb-16 md:pb-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[22px] font-semibold tracking-tight text-slate md:text-[28px]">
            Related features
          </h2>
          <Link href="/features" className="text-[13px] font-medium text-slate/70 hover:text-slate">
            See all →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {others.map((f) => (
            <Link
              key={f.slug}
              href={`/features/${f.slug}`}
              className="group rounded-2xl border border-umber-soft/30 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft"
            >
              <span
                aria-hidden
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate ${
                  f.tone === "butter" ? "bg-chartreuse/55" : "bg-sea-soft/70"
                }`}
              >
                <FeatureIcon slug={f.slug} small />
              </span>
              <p className="mt-4 text-[15px] font-semibold text-slate">{f.title}</p>
              <p className="mt-1 line-clamp-2 text-[13px] text-slate/65">{f.tagline}</p>
              <p className="mt-3 text-[12px] font-medium text-slate transition-colors group-hover:text-umber">
                Learn more <span aria-hidden>→</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaBlock() {
  return (
    <section className="bg-oat pb-20 md:pb-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="rounded-[28px] border border-umber-soft/30 bg-white p-8 shadow-card md:p-12">
          <h2 className="text-[24px] font-semibold tracking-tight text-slate md:text-[34px]">
            Try it on your next service.
          </h2>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
            Free Starter plan up to 5 tables. Growth and Pro both include a
            14-day free trial. No card needed to start.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-chartreuse px-5 py-3 text-sm font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
            >
              Get Started Free
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full border border-umber-soft/50 bg-white px-5 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/30"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Per-feature preview visual + icon                                      */
/* ---------------------------------------------------------------------- */

function FeaturePreview({ slug }: { slug: string }) {
  // Each preview is a CSS mockup that hints at the product surface for
  // that feature. Image assets can be slotted in later by replacing the
  // matching block.
  switch (slug) {
    case "qr-payments":
      return <BillPhonePreview />;
    case "qr-orders":
      return <OrderPhonePreview />;
    case "digital-menu":
      return <DigitalMenuPreview />;
    case "wishlist":
      return <WishlistPhonePreview />;
    case "promotions":
      return <PromotionsPreview />;
    case "pos-integration":
      return <PosPreview />;
    case "call-waiter":
      return <CallWaiterPreview />;
    case "reviews":
      return <ReviewsPreview />;
    case "analytics":
      return <AnalyticsPreview />;
    default:
      return <BillPhonePreview />;
  }
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 rounded-[36px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 75%)",
        }}
      />
      <div className="rounded-[28px] bg-linen p-6 ring-1 ring-umber-soft/30 md:p-8">
        {children}
      </div>
    </div>
  );
}

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[36px] bg-slate p-2 shadow-lift">
      <div className="rounded-[28px] bg-white p-4">{children}</div>
    </div>
  );
}

function BillPhonePreview() {
  return (
    <PreviewFrame>
      <PhoneShell>
        <div className="flex items-center justify-between text-[10px] text-slate/55">
          <span>9:41</span>
          <span className="font-medium text-slate/70">Your Bill</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <p className="mt-2 text-center text-[10px] text-umber">Table 12</p>

        <ul className="mt-4 space-y-2 text-[12px] text-slate/80">
          <BillRow name="Truffle Pasta" price="$24.00" />
          <BillRow name="Grilled Salmon" price="$28.00" />
          <BillRow name="2 × Lemonade" price="$6.00" />
        </ul>

        <div className="mt-4 border-t border-slate/10 pt-3 text-[11px] text-slate/65">
          <TotalRow label="Subtotal" value="$58.00" />
          <TotalRow label="Tax" value="$4.64" />
          <TotalRow label="Tip" value="$8.00" />
        </div>
        <div className="mt-2 border-t border-slate/10 pt-3 text-[14px] font-semibold text-slate">
          <TotalRow label="Total" value="$70.64" bold />
        </div>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate py-2.5 text-[12px] font-semibold text-oat"
        >
           Pay
        </button>
        <p className="mt-2 text-center text-[10px] text-slate/55">Pay with Card</p>
      </PhoneShell>
    </PreviewFrame>
  );
}

function BillRow({ name, price }: { name: string; price: string }) {
  return (
    <li className="flex items-baseline justify-between">
      <span>{name}</span>
      <span className="font-mono tabular-nums">{price}</span>
    </li>
  );
}

function TotalRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${bold ? "font-semibold text-slate" : ""}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function OrderPhonePreview() {
  const items = [
    { name: "Burrata Salad", price: "$14.00" },
    { name: "Truffle Pasta", price: "$24.00" },
    { name: "Grilled Salmon", price: "$28.00" },
  ];
  return (
    <PreviewFrame>
      <PhoneShell>
        <div className="flex items-center justify-between text-[10px] text-slate/55">
          <span>9:41</span>
          <span className="font-medium text-slate/70">Our Menu</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>

        <div className="mt-3 flex gap-1.5 text-[10px]">
          {["All", "Starters", "Mains", "Drinks"].map((t, i) => (
            <span
              key={t}
              className={
                i === 0
                  ? "rounded-full bg-slate px-2 py-1 font-semibold text-oat"
                  : "rounded-full bg-oat px-2 py-1 text-slate/65"
              }
            >
              {t}
            </span>
          ))}
        </div>

        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Popular</p>
        <ul className="mt-2 space-y-2">
          {items.map((it) => (
            <li key={it.name} className="flex items-center gap-3 rounded-xl bg-oat p-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chartreuse/60 text-slate" aria-hidden>
                <PlateIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-slate">{it.name}</p>
                <p className="text-[9px] text-slate/55">{it.price}</p>
              </div>
              <button type="button" className="rounded-full bg-slate px-2 py-0.5 text-[9px] font-semibold text-oat">Add</button>
            </li>
          ))}
        </ul>
      </PhoneShell>
    </PreviewFrame>
  );
}

function DigitalMenuPreview() {
  const items = [
    { name: "Truffle Pasta", price: "$24.00", body: "Hand-rolled pappardelle, black truffle, brown butter, parmesan." },
    { name: "Grilled Salmon", price: "$28.00", body: "Lemon butter, asparagus, charred lemon, herb oil." },
  ];
  return (
    <PreviewFrame>
      <div className="rounded-[18px] bg-slate p-2.5 shadow-lift">
        <div className="rounded-[12px] bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-slate">Our Menu</p>
            <div className="flex gap-1 text-[9px]">
              {["Starters", "Mains", "Drinks", "Desserts"].map((t, i) => (
                <span
                  key={t}
                  className={
                    i === 1
                      ? "rounded-full bg-slate px-1.5 py-0.5 font-semibold text-oat"
                      : "rounded-full bg-oat px-1.5 py-0.5 text-slate/65"
                  }
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <ul className="mt-3 space-y-2.5">
            {items.map((it) => (
              <li key={it.name} className="flex items-start gap-3 rounded-xl bg-oat p-2.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-chartreuse/60 text-slate" aria-hidden>
                  <PlateIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-slate">{it.name}</p>
                    <span className="text-[10px] font-semibold text-slate">{it.price}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[9px] text-slate/55">{it.body}</p>
                  <button type="button" className="mt-1.5 rounded-md bg-slate px-2 py-1 text-[9px] font-semibold text-oat">
                    Add to Order
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PreviewFrame>
  );
}

function WishlistPhonePreview() {
  const items = [
    { name: "Spicy Tuna Roll", price: "$16.00" },
    { name: "Wagyu Steak", price: "$42.00" },
    { name: "Cheesecake", price: "$8.00" },
  ];
  return (
    <PreviewFrame>
      <PhoneShell>
        <div className="flex items-center justify-between text-[10px] text-slate/55">
          <span>9:41</span>
          <span className="font-medium text-slate/70">My Wishlist</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>

        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li key={it.name} className="flex items-center gap-3 rounded-xl bg-oat p-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chartreuse/60 text-slate" aria-hidden>
                <PlateIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-slate">{it.name}</p>
                <p className="text-[9px] text-slate/55">{it.price}</p>
              </div>
              <span aria-hidden className="text-slate/60">
                <HeartIcon />
              </span>
            </li>
          ))}
        </ul>

        <button type="button" className="mt-4 w-full rounded-xl bg-chartreuse py-2.5 text-[11px] font-semibold text-slate">
          Show to Waiter
        </button>
      </PhoneShell>
    </PreviewFrame>
  );
}

function PromotionsPreview() {
  return (
    <PreviewFrame>
      <div className="space-y-3">
        <div className="rounded-2xl bg-coral-soft/80 p-5 shadow-card">
          <p className="text-[20px] font-semibold leading-tight text-slate">Happy Hour</p>
          <p className="text-[12px] text-slate/70">4PM - 7PM</p>
          <p className="mt-3 text-[15px] font-semibold text-slate">50% OFF</p>
          <p className="text-[12px] text-slate/70">Selected Cocktails</p>
          <button type="button" className="mt-3 rounded-full bg-slate px-4 py-1.5 text-[11px] font-semibold text-oat">
            Order Now
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30">
            <p className="text-[11px] font-semibold text-slate">Business Lunch</p>
            <p className="mt-1 text-[18px] font-semibold text-slate">$12.90</p>
            <p className="text-[9px] text-slate/55">Mon - Fri · 11AM - 3PM</p>
            <button type="button" className="mt-2 rounded-full bg-slate px-2.5 py-1 text-[9px] font-semibold text-oat">
              Order Now
            </button>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30">
            <p className="text-[11px] font-semibold text-slate">New Dish</p>
            <p className="mt-1 text-[12px] text-slate">Try our new<br />Truffle Risotto</p>
            <button type="button" className="mt-2 rounded-full bg-slate px-2.5 py-1 text-[9px] font-semibold text-oat">
              Order Now
            </button>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function PosPreview() {
  const rows = [
    { name: "Truffle Pasta", price: "$0.00" },
    { name: "Burrata Salad", price: "$0.00" },
    { name: "Lemonade", price: "$0.00" },
    { name: "Grilled Salmon", price: "$0.00" },
  ];
  return (
    <PreviewFrame>
      <div className="rounded-[16px] bg-slate p-2 shadow-lift">
        <div className="rounded-[10px] bg-white p-3">
          <div className="flex items-center justify-between text-[10px] text-slate/55">
            <span className="font-semibold text-slate">New Order</span>
            <span>Table 12</span>
          </div>
          <table className="mt-3 w-full text-[10px]">
            <thead className="text-slate/55">
              <tr>
                <th className="py-1 text-left font-medium">Item</th>
                <th className="py-1 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="text-slate">
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-slate/8">
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="mt-3 w-full rounded-md bg-slate py-1.5 text-[10px] font-semibold text-oat">
            Send
          </button>
        </div>
      </div>
    </PreviewFrame>
  );
}

function CallWaiterPreview() {
  return (
    <PreviewFrame>
      <PhoneShell>
        <div className="flex items-center justify-between text-[10px] text-slate/55">
          <span>9:41</span>
          <span className="font-medium text-slate/70">Table 12</span>
          <span aria-hidden className="opacity-0">9:41</span>
        </div>
        <p className="mt-3 text-[11px] text-slate/55">Tap to request</p>
        <ul className="mt-3 space-y-2">
          {[
            { name: "Call Waiter", sub: "Get the right help fast", primary: true },
            { name: "Request Bill", sub: "Bring me the tab" },
            { name: "Ask for Refill", sub: "Refresh my drink" },
            { name: "Ask for Help", sub: "Something needs attention" },
          ].map((r) => (
            <li
              key={r.name}
              className={`flex items-center gap-3 rounded-xl p-2.5 ${
                r.primary ? "bg-chartreuse/55" : "bg-oat"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-slate ring-1 ring-umber-soft/30" aria-hidden>
                <SmallBellIcon />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-slate">{r.name}</p>
                <p className="text-[9px] text-slate/55">{r.sub}</p>
              </div>
            </li>
          ))}
        </ul>
      </PhoneShell>
    </PreviewFrame>
  );
}

function ReviewsPreview() {
  return (
    <PreviewFrame>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">
          alerts@tab-call.com
        </p>
        <p className="mt-2 text-[14px] font-semibold text-slate">Table 7 · 2 stars</p>
        <p className="mt-3 border-l-2 border-coral/60 pl-3 text-[12px] italic leading-relaxed text-slate/70">
          &ldquo;Waited 8 min for second drink, server seemed annoyed when I asked again.&rdquo;
        </p>
        <ul className="mt-4 space-y-2 text-[11px] text-slate/65">
          <li className="flex justify-between"><span className="text-umber">Likely cause</span><span>Service speed</span></li>
          <li className="flex justify-between"><span className="text-umber">Server</span><span>Marcus</span></li>
          <li className="flex justify-between"><span className="text-umber">Suggested</span><span>Comp the next round</span></li>
        </ul>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-slate/55">
          <span className="h-1.5 w-1.5 rounded-full bg-sea" />
          Routed privately. We never email the guest.
        </p>
      </div>
    </PreviewFrame>
  );
}

function AnalyticsPreview() {
  const bars = [40, 65, 80, 55, 90, 70, 45];
  return (
    <PreviewFrame>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-umber-soft/30 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-umber">Today</p>
        <p className="mt-1 text-[14px] font-semibold text-slate">Request volume by hour</p>

        <div className="mt-5 flex h-32 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1">
              <div
                className="rounded-t bg-slate"
                style={{ height: `${h}%` }}
                aria-hidden
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[9px] text-slate/55">
          <span>5p</span><span>6p</span><span>7p</span><span>8p</span><span>9p</span><span>10p</span><span>11p</span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            { v: "1m 32s", l: "Median ack" },
            { v: "3.1x", l: "vs paper" },
            { v: "47", l: "Served" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg bg-oat p-2">
              <p className="text-[14px] font-semibold text-slate">{s.v}</p>
              <p className="text-[9px] text-slate/55">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

/* Per-feature glyph icon. */
function FeatureIcon({ slug, small = false }: { slug: string; small?: boolean }) {
  const s = small ? 18 : 22;
  const stroke = "currentColor";
  const common = {
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (slug) {
    case "qr-payments":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <rect x="3" y="5" width="13" height="11" rx="2" />
          <path d="M3 9h13" />
          <rect x="9" y="11" width="12" height="9" rx="2" />
          <path d="M9 14h12" />
        </svg>
      );
    case "qr-orders":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM18 17h3M17 17v3" />
        </svg>
      );
    case "digital-menu":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <circle cx="13.5" cy="6.5" r="2.5" />
          <path d="M5 11h11M5 15h7M5 19h13" />
        </svg>
      );
    case "wishlist":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "promotions":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7" cy="7" r="1.2" fill={stroke} />
        </svg>
      );
    case "pos-integration":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <path d="M7 8H4l3-4M17 16h3l-3 4" />
          <path d="M4 8h12" />
          <path d="M20 16H8" />
        </svg>
      );
    case "call-waiter":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "reviews":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <path d="M12 2l2.9 6.3 6.9.6-5.2 4.7 1.6 6.8L12 17l-6.2 3.4 1.6-6.8L2.2 8.9l6.9-.6L12 2z" />
        </svg>
      );
    case "analytics":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" {...common}>
          <path d="M4 20V8M10 20V4M16 20v-8M22 20V14M2 20h22" />
        </svg>
      );
    default:
      return null;
  }
}

function PlateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function SmallBellIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}
