/**
 * TabCall founder / super-admin settings.
 *
 * Read-mostly platform configuration page. Surfaces:
 *   - Operator allowlist (OPERATOR_EMAILS)
 *   - Integration health (Stripe, Resend, Upstash, Sentry, Anthropic)
 *   - Plan price IDs
 *   - Deployment metadata (Vercel commit / branch / region)
 *   - Quick actions (run cron manually, open external dashboards)
 *
 * Add-an-operator is intentionally NOT in-app today — it lives in
 * Vercel env (`OPERATOR_EMAILS`) so a leaked DB row can't grant
 * platform staff. The instructions are surfaced here.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator, operatorAllowlist } from "@/lib/auth/operator";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — platform settings" };

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

export default async function PlatformSettingsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator/settings");
  if (!isOperator(session)) {
    return <Denial email={session.email} />;
  }

  const integrations = [
    { key: "Stripe (live)",       envs: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"] },
    { key: "Resend",              envs: ["RESEND_API_KEY", "RESEND_FROM"] },
    { key: "Upstash Redis",       envs: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] },
    { key: "Sentry",              envs: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"] },
    { key: "Anthropic (AI)",      envs: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] },
    { key: "Twilio (SMS)",        envs: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] },
    { key: "Supabase Storage",    envs: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] },
    { key: "Public origin",       envs: ["APP_URL", "PUBLIC_QR_BASE_URL"] },
    { key: "Realtime (Fastify)",  envs: ["FASTIFY_INTERNAL_URL", "NEXT_PUBLIC_SOCKET_URL", "INTERNAL_API_SECRET"] },
    { key: "Cron secret",         envs: ["BENCHMARK_CRON_SECRET"] },
  ] as const;

  const planPrices = [
    { plan: "Growth", env: "STRIPE_PRICE_GROWTH" },
    { plan: "Pro",    env: "STRIPE_PRICE_PRO" },
  ] as const;

  // Read a couple of one-off counts so the founder can eyeball whether
  // anything's burning in real time without leaving the page.
  const [orgCount, venueCount, staffCount, recentSignups, auditCount] = await Promise.all([
    db.organization.count(),
    db.venue.count(),
    db.staffMember.count(),
    db.organization.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
    db.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } } }),
  ]);

  const operators = operatorAllowlist();

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Founder</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Platform settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Read-mostly view of TabCall&rsquo;s plumbing. Add-an-operator
          and key rotation live in Vercel env — surfaced here so you
          know exactly what&rsquo;s set without dumping secrets into the
          page.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Operators (OPERATOR_EMAILS)" tag={`${operators.length} email${operators.length === 1 ? "" : "s"}`}>
          {operators.length === 0 ? (
            <p className="rounded-lg bg-coral/10 px-3 py-2 text-[12px] text-coral">
              ⚠ No operators set. Anyone hitting <code>/operator</code> will be denied. Set <code>OPERATOR_EMAILS</code> in Vercel.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {operators.map(e => (
                <li
                  key={e}
                  className="flex items-center justify-between rounded-lg bg-slate/5 px-3 py-1.5 font-mono text-[12px] text-slate/80"
                >
                  <span>{e}</span>
                  {e === session.email.toLowerCase() ? (
                    <span className="rounded-full bg-chartreuse/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate">
                      you
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate/50">
            Add another founder: Vercel → tabsignal → Settings → Environment Variables → edit{" "}
            <code>OPERATOR_EMAILS</code> → comma-separated list → redeploy.
          </p>
        </Card>

        <Card title="Plan pricing">
          <ul className="space-y-2">
            {planPrices.map(p => {
              const set = envPresent(p.env);
              return (
                <li key={p.env} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-slate">{p.plan}</span>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      set ? "bg-chartreuse/30 text-slate" : "bg-coral/15 text-coral",
                    ].join(" ")}
                  >
                    {set ? "configured" : "missing"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-slate/50">
            Stripe price IDs are env-only so a misconfigured Stripe ID never
            ships to a customer&rsquo;s checkout. Plan flips happen in{" "}
            <Link className="underline" href="/operator">/operator</Link> per-org.
          </p>
        </Card>

        <Card title="Integrations" tag={`${integrations.filter(i => i.envs.every(envPresent)).length}/${integrations.length} live`}>
          <ul className="space-y-2 text-[13px]">
            {integrations.map(it => {
              const live = it.envs.every(envPresent);
              const partial = !live && it.envs.some(envPresent);
              return (
                <li key={it.key} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate">{it.key}</p>
                    <p className="font-mono text-[10px] text-slate/45">
                      {it.envs.map(e => `${e}${envPresent(e) ? "✓" : "✗"}`).join(" · ")}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      live ? "bg-chartreuse/30 text-slate"
                        : partial ? "bg-coral/15 text-coral"
                        : "bg-slate/10 text-slate/55",
                    ].join(" ")}
                  >
                    {live ? "live" : partial ? "partial" : "unset"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Live counts">
          <ul className="space-y-2 text-[13px]">
            <Stat label="Organizations" value={orgCount} />
            <Stat label="Venues" value={venueCount} />
            <Stat label="Staff seats" value={staffCount} />
            <Stat label="New orgs · 24h" value={recentSignups} />
            <Stat label="Audit entries · 7d" value={auditCount} />
          </ul>
          <p className="mt-3 text-[11px] text-slate/50">
            Cross-venue signal. Per-venue breakdowns: open the venue from{" "}
            <Link className="underline" href="/operator">/operator</Link>.
          </p>
        </Card>

        <Card title="Deployment">
          <ul className="space-y-2 text-[13px]">
            <Row label="Region" value={process.env.VERCEL_REGION ?? "local"} />
            <Row label="Env" value={process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "—"} />
            <Row label="Commit" value={(process.env.VERCEL_GIT_COMMIT_SHA ?? "—").slice(0, 7)} mono />
            <Row label="Branch" value={process.env.VERCEL_GIT_COMMIT_REF ?? "—"} mono />
            <Row label="Node" value={process.version} mono />
          </ul>
        </Card>

        <Card title="Quick links">
          <ul className="space-y-2 text-[13px]">
            <ExtLink label="Vercel project"        href="https://vercel.com/tab-call-projects/tabsignal" />
            <ExtLink label="Stripe dashboard"      href="https://dashboard.stripe.com" />
            <ExtLink label="Resend emails"         href="https://resend.com/emails" />
            <ExtLink label="Upstash console"       href="https://console.upstash.com/redis" />
            <ExtLink label="Sentry issues"         href="https://sentry.io" />
            <ExtLink label="Supabase project"      href="https://supabase.com/dashboard" />
            <Link href="/operator/audit" className="block rounded-lg bg-slate px-3 py-2 text-center text-[12px] font-medium text-oat hover:bg-slate/90">
              Open cross-venue audit log →
            </Link>
          </ul>
        </Card>
      </div>
    </>
  );
}

function Card({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate/10 bg-white p-5">
      <header className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{title}</p>
        {tag ? <span className="text-[11px] text-slate/50">{tag}</span> : null}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between border-b border-slate/5 py-1 last:border-0">
      <span className="text-slate/60">{label}</span>
      <span className="font-mono tabular-nums text-slate">{value.toLocaleString()}</span>
    </li>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-slate/5 py-1 last:border-0">
      <span className="text-slate/60">{label}</span>
      <span className={mono ? "font-mono text-[12px] text-slate" : "text-slate"}>{value}</span>
    </li>
  );
}

function ExtLink({ label, href }: { label: string; href: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between rounded-lg border border-slate/15 px-3 py-2 text-slate/80 hover:border-slate/30 hover:text-slate"
      >
        <span>{label}</span>
        <span aria-hidden>↗</span>
      </a>
    </li>
  );
}

function Denial({ email }: { email: string }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <p className="text-3xl">·</p>
        <h1 className="mt-3 text-2xl font-medium text-slate">Operator only.</h1>
        <p className="mt-3 text-sm text-slate/60">
          You&rsquo;re signed in as <span className="font-mono text-[12px]">{email}</span>.
          To get platform settings access, add this email to{" "}
          <code className="text-[12px]">OPERATOR_EMAILS</code> in Vercel and redeploy.
        </p>
      </div>
    </main>
  );
}
