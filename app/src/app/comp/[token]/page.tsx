import Link from "next/link";
import { db } from "@/lib/db";
import { verifyCompToken } from "@/lib/auth/comp-token";
import { CompAction } from "./comp-action";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · comp this round" };

export default async function CompPage({ params }: { params: { token: string } }) {
  const claims = await verifyCompToken(params.token);

  if (!claims) {
    return (
      <main className="flex min-h-screen flex-col bg-slate text-oat">
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <p className="text-3xl">·</p>
            <h1 className="mt-3 text-2xl font-medium">Comp link expired</h1>
            <p className="mt-3 text-sm leading-relaxed text-oat/65">
              These links are valid for 24 hours after a bad rating arrives.
              For older feedback, issue the comp as a Stripe refund.
            </p>
            <Link href="/admin" className="mt-6 inline-block text-sm text-chartreuse underline-offset-4 hover:underline">
              Open the dashboard →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Pull the session preview so the manager sees what they're crediting.
  const session = await db.guestSession.findUnique({
    where: { id: claims.sessionId },
    select: {
      paidAt: true,
      expiresAt: true,
      lineItems: true,
      table: { select: { label: true } },
      venue: { select: { name: true, slug: true } },
    },
  });
  const alreadyApplied = await db.compAction.findUnique({ where: { jti: claims.jti } });

  return (
    <main className="flex min-h-screen flex-col bg-slate text-oat">
      <header className="border-b border-white/5 px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-oat/70 hover:text-oat">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
          </svg>
          TabCall
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <p className="text-[11px] uppercase tracking-[0.18em] text-oat/40">
          {session?.venue.name ?? "TabCall"}
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">
          Comp ${ (claims.amountCents / 100).toFixed(0) } at {session?.table.label ?? "this table"}?
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-oat/70">
          Applies a one-tap credit to the open tab so the next round comes
          on the house. The guest sees it the moment they refresh the bill.
        </p>

        <CompAction
          token={params.token}
          tableLabel={session?.table.label ?? ""}
          amountCents={claims.amountCents}
          alreadyPaid={!!session?.paidAt}
          alreadyApplied={!!alreadyApplied}
        />

        <div className="mt-10 space-y-2 border-t border-white/5 pt-6 text-[11px] text-oat/50">
          <p>· Single-use link. Applies once, even if reloaded.</p>
          <p>· Comp is a negative line item, settled via Stripe at payment.</p>
          <p>· If the tab&rsquo;s already paid, send a Stripe refund instead.</p>
        </div>
      </div>
    </main>
  );
}
