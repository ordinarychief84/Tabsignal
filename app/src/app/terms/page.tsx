import Link from "next/link";

export const metadata = { title: "TabCall · terms of service" };

// Stub terms page. Real legal copy lives here once we have it. Linked from
// the signup footer so "agree to TabCall's terms" actually points somewhere.
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-oat text-slate">
      <header className="border-b border-slate/10 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#C9F61C" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#C9F61C" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight">TabCall</span>
          </Link>
          <Link href="/signup" className="text-xs tracking-wide text-slate/50 hover:text-slate">
            Start free →
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Terms of Service</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">The short version.</h1>
        <p className="mt-4 text-base leading-relaxed text-slate/70">
          Effective May 9, 2026. Plain language. The full legal version is on
          the way. Until then, this is what you&rsquo;re agreeing to.
        </p>

        <Section title="Who runs TabCall">
          <p>
            TabCall is operated by Tab-Call (we / us / our), a US-based
            company building software for independent bars and restaurants.
            Reach us at{" "}
            <a href="mailto:hello@tabcall.app" className="text-umber underline-offset-4 hover:underline">
              hello@tabcall.app
            </a>
            .
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You sign in with a magic link, no passwords. The link expires in
            15 minutes. Keep your email account secure: anyone with access to
            it can sign in to your venue.
          </p>
        </Section>

        <Section title="Pricing and trials">
          <p>
            Starter is free for up to 5 tables, no card required. Growth is
            $99/month, Pro is $299/month, both billed per venue. Growth and
            Pro start with a 14-day free trial: pay nothing for 14 days,
            cancel anytime, no card needed to start. After day 14, add a card
            to keep paid features. If you don&rsquo;t, you drop to Starter.
            Stripe processing (2.9% + 30¢) is passed through at cost. Founding
            plan is concierge only, priced on request.
          </p>
        </Section>

        <Section title="Your data">
          <p>
            You own your venue&rsquo;s data: sessions, requests, reviews,
            reservations, regulars. We process it to run the service. We
            never sell guest data. Guests opt in by phone number only. Their
            loyalty record stays at the venue level (no cross-venue identity
            sharing without explicit consent).
          </p>
          <p>
            If you stop using TabCall, you can export your data via CSV from
            the admin panel or by emailing us. We delete our copy on request.
          </p>
        </Section>

        <Section title="Payments">
          <p>
            Payments are processed by Stripe Connect. Funds settle directly
            to your Stripe account. TabCall never sees, stores, or transmits
            card data.
          </p>
        </Section>

        <Section title="Liability">
          <p>
            TabCall is provided &ldquo;as is.&rdquo; We aim for very high
            uptime but can&rsquo;t promise zero outages. We&rsquo;re not
            responsible for missed orders, stranded tabs, or service
            disruptions caused by upstream providers (Stripe, your POS, your
            wifi). Run a paper backup process for the first week so
            you&rsquo;re comfortable.
          </p>
        </Section>

        <Section title="Service-of-alcohol responsibility">
          <p>
            TabCall surfaces guest requests and AI-classified reviews to your
            staff. It does <strong>not</strong> verify guest age or sobriety.
            Compliance with TABC and state alcohol regulations remains
            entirely with the venue and its staff. Use the &ldquo;check ID on
            first drink&rdquo; setting as one tool in your compliance kit,
            not the whole kit.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We&rsquo;ll update these terms as the product evolves. Material
            changes will be emailed to your account at least 30 days before
            they take effect. Continuing to use TabCall after that means you
            accept the update.
          </p>
        </Section>

        <p className="mt-12 text-[11px] text-slate/45">
          Questions? Email{" "}
          <a href="mailto:hello@tabcall.app" className="text-umber underline-offset-4 hover:underline">
            hello@tabcall.app
          </a>
          . We answer.
        </p>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 rounded-2xl border border-slate/10 bg-white px-6 py-5">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-umber">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate/75">{children}</div>
    </section>
  );
}
