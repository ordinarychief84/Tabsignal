/**
 * Admin POS integration page.
 *
 * Server-rendered. Reads the current `PosIntegration` row + the last 50
 * `PosSyncLog` entries and hands provider/status to a client form for
 * editing. `encryptedCredentials` is `select`-ed out — the page never
 * receives the secret blob.
 */

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { PosForm } from "./pos-form";
import type { PosIntegrationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · POS" };

const STATUS_TONE: Record<PosIntegrationStatus, { dot: string; pill: string; label: string }> = {
  CONNECTED: {
    dot: "bg-chartreuse",
    pill: "bg-chartreuse/30 text-slate",
    label: "Connected",
  },
  PENDING: {
    dot: "bg-umber",
    pill: "bg-umber/15 text-umber",
    label: "Pending",
  },
  ERROR: {
    dot: "bg-coral",
    pill: "bg-coral/15 text-coral",
    label: "Error",
  },
  DISCONNECTED: {
    dot: "bg-slate/40",
    pill: "bg-slate/10 text-slate/60",
    label: "Disconnected",
  },
};

const ACTION_LABEL: Record<string, string> = {
  "menu.sync": "Menu sync",
  "order.send": "Order pushed",
  "order.update_status": "Order status updated",
  "bill.fetch": "Bill fetched",
  "bill.mark_paid": "Bill marked paid",
};

function fmtTimestamp(d: Date): string {
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

type Provider = "NONE" | "TOAST" | "SQUARE" | "CLOVER";

function coerceProvider(v: string | undefined | null): Provider {
  return v === "TOAST" || v === "SQUARE" || v === "CLOVER" ? v : "NONE";
}

export default async function PosPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/pos`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: { id: true },
  });
  if (!venue || venue.id !== session.venueId) return null;

  const effectiveRole = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(effectiveRole, "pos.manage")) {
    return (
      <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/60">
        Your role can&rsquo;t manage POS integrations. Ask a Manager.
      </div>
    );
  }

  // NOTE: `encryptedCredentials` is intentionally not in the `select`. We
  // only need a boolean ("are there credentials?") for the UI hint, which
  // we derive below via a separate count-style query.
  const integration = await db.posIntegration.findUnique({
    where: { venueId: venue.id },
    select: {
      provider: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      updatedAt: true,
    },
  });

  // Boolean-only credentials check so the encrypted blob never leaves the DB.
  const credentialsRow = await db.posIntegration.findFirst({
    where: {
      venueId: venue.id,
      NOT: { encryptedCredentials: null },
    },
    select: { id: true },
  });
  const hasCredentials = !!credentialsRow;

  const logs = await db.posSyncLog.findMany({
    where: { venueId: venue.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      provider: true,
      action: true,
      status: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  const currentStatus: PosIntegrationStatus = integration?.status ?? "PENDING";
  const tone = STATUS_TONE[currentStatus];
  const currentProvider = coerceProvider(integration?.provider);

  return (
    <>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Integrations</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">POS</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate/60">
          Connect TabCall to your point-of-sale so menu changes sync, orders
          flow to the kitchen, and bills close in both systems at once.
          Today this is a scaffold. Vendor adapters land next.
        </p>
      </header>

      {currentStatus !== "CONNECTED" ? (
        <div className="mb-6 rounded-2xl border border-umber/30 bg-umber/10 px-5 py-4 text-sm text-slate">
          POS connection pending. Orders and bills live inside TabCall.
        </div>
      ) : null}

      <section className="mb-6 rounded-2xl border border-slate/10 bg-white px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Status</p>
            <div className="mt-2 flex items-center gap-3">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone.pill}`}>
                {tone.label}
              </span>
              <span className="text-sm text-slate">
                {currentProvider === "NONE" ? "No provider selected" : currentProvider}
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <dt className="text-slate/55">Last sync</dt>
            <dd className="text-slate">
              {integration?.lastSyncAt ? fmtTimestamp(integration.lastSyncAt) : "—"}
            </dd>
            <dt className="text-slate/55">Updated</dt>
            <dd className="text-slate">
              {integration?.updatedAt ? fmtTimestamp(integration.updatedAt) : "—"}
            </dd>
          </dl>
        </div>
        {integration?.lastError ? (
          <p className="mt-4 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
            {integration.lastError}
          </p>
        ) : null}
      </section>

      <section className="mb-8 rounded-2xl border border-slate/10 bg-white px-6 py-5">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Configure</p>
        <h2 className="mb-4 mt-2 text-lg font-medium tracking-tight">Provider &amp; credentials</h2>
        <PosForm
          slug={params.slug}
          initialProvider={currentProvider}
          initialStatus={currentStatus}
          hasCredentials={hasCredentials}
        />
      </section>

      <section>
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Audit</p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">Sync log</h2>
          </div>
          <p className="text-xs text-slate/55">Last {logs.length} entries</p>
        </header>

        {logs.length === 0 ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-10 text-center text-sm text-slate/55">
            No sync activity yet. Connect a provider to start recording sync events.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate/5 text-[11px] uppercase tracking-[0.18em] text-umber">
                <tr>
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const ok = l.status === "success";
                  return (
                    <tr key={l.id} className="border-t border-slate/10">
                      <td className="px-5 py-3 text-xs text-slate/70">{fmtTimestamp(l.createdAt)}</td>
                      <td className="px-5 py-3 text-xs text-slate">{l.provider}</td>
                      <td className="px-5 py-3 text-xs text-slate">{ACTION_LABEL[l.action] ?? l.action}</td>
                      <td className="px-5 py-3">
                        <span
                          className={[
                            "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            ok ? "bg-chartreuse/30 text-slate" : "bg-coral/15 text-coral",
                          ].join(" ")}
                        >
                          {ok ? "Success" : "Error"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-coral">{l.errorMessage ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
