import Link from "next/link";
import type { Metadata } from "next";
import { FEATURES } from "@/lib/features-data";
import { MarketingNav, MarketingFooter } from "../marketing-chrome";

export const metadata: Metadata = {
  title: "TabCall · Features",
  description:
    "Everything TabCall does: QR payments, QR orders, digital menu, wishlist, promotions, POS integration, call waiter, reviews, analytics.",
};

export default function FeaturesPage() {
  return (
    <main className="bg-oat text-slate">
      <MarketingNav />

      <section className="relative overflow-hidden border-b border-umber-soft/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 50% at 80% 20%, rgba(199, 214, 207, 0.4) 0%, rgba(247, 245, 242, 0) 60%), radial-gradient(40% 40% at 10% 90%, rgba(242, 231, 183, 0.28) 0%, rgba(247, 245, 242, 0) 65%)",
          }}
        />
        <div className="mx-auto max-w-7xl px-5 py-14 text-center md:px-8 md:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sea-soft/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate/75">
            Built for hospitality
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] text-slate md:text-[44px] lg:text-[56px]">
            Every guest interaction. One platform.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-slate/65 md:text-[17px]">
            From scan to served to settled. Each feature works on its own and
            gets stronger when stacked.
          </p>
        </div>
      </section>

      <section className="bg-oat py-16 md:py-20">
        <div className="mx-auto max-w-7xl space-y-5 px-5 md:px-8">
          {FEATURES.map((f, i) => (
            <Link
              key={f.slug}
              href={`/features/${f.slug}`}
              className="group block rounded-2xl border border-umber-soft/30 bg-white p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft md:p-8"
            >
              <div className="grid items-center gap-6 md:grid-cols-[auto_1fr_auto] md:gap-8">
                <span
                  aria-hidden
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-slate ${
                    f.tone === "butter" ? "bg-chartreuse/55" : "bg-sea-soft/70"
                  }`}
                >
                  <span className="text-[18px] font-semibold tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <div className="min-w-0">
                  <h2 className="text-[20px] font-semibold text-slate md:text-[24px]">
                    {f.title}
                  </h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-slate/65 md:text-[15px]">
                    {f.tagline}
                  </p>
                </div>
                <p className="text-[13px] font-medium text-slate transition-colors group-hover:text-umber">
                  Learn more <span aria-hidden>→</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-oat pb-20 md:pb-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="rounded-[28px] border border-umber-soft/30 bg-white p-8 shadow-card md:p-12">
            <h2 className="text-[24px] font-semibold tracking-tight text-slate md:text-[34px]">
              See it on your floor.
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
                href="/how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-umber-soft/50 bg-white px-5 py-3 text-sm font-medium text-slate transition-colors hover:border-slate/30"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
