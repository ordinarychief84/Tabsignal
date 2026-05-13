import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveByQrToken } from "@/lib/session";
import { dollars } from "@/lib/bill";
import { BillSplitScreen, type BillItemRow } from "./bill-split-screen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: { qrToken: string } };

export default async function GuestQrBillPage({ params }: PageProps) {
  let resolved;
  try {
    resolved = await resolveByQrToken(params.qrToken);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  // Spec-verbatim Bill model (Guest Commerce v2). Coexists with the
  // legacy GuestSession.lineItems JSON; the orders agent writes here.
  const bill = await db.bill.findFirst({
    where: {
      tableId: resolved.tableId,
      status: { in: ["OPEN", "PARTIAL"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      splits: true,
    },
  });

  return (
    <main className="text-slate">
      <div className="mx-auto flex max-w-md flex-col px-6 py-8">
        <header className="mb-7">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">
            {resolved.venueName}
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">
            {resolved.tableLabel}
          </h1>
          <p className="mt-1 text-sm text-slate/60">Your bill</p>
        </header>

        {!bill ? (
          <div className="rounded-2xl border border-slate/10 bg-white p-6 text-center">
            <p className="text-3xl">·</p>
            <h2 className="mt-3 text-base font-medium">No bill yet</h2>
            <p className="mt-2 text-sm text-slate/60">
              Place an order from the menu, or ask your server to open a tab.
            </p>
            <div className="mt-5 flex flex-col items-center gap-2">
              <Link
                href={`/guest/${encodeURIComponent(params.qrToken)}/menu`}
                className="rounded-full bg-slate px-5 py-2 text-sm text-oat hover:bg-slate/90"
              >
                Browse menu →
              </Link>
              <Link
                href={`/guest/${encodeURIComponent(params.qrToken)}`}
                className="text-sm text-slate/60 underline-offset-4 hover:text-slate hover:underline"
              >
                ← back to table
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-2xl border border-slate/10 bg-white px-5 py-4 text-sm">
              <Row label="Subtotal" value={dollars(bill.subtotalCents)} />
              <Row label="Tax" value={dollars(bill.taxCents)} />
              {bill.serviceCents > 0 ? (
                <Row label="Service" value={dollars(bill.serviceCents)} />
              ) : null}
              {bill.tipTotalCents > 0 ? (
                <Row label="Tip" value={dollars(bill.tipTotalCents)} />
              ) : null}
              <div className="mt-2 border-t border-slate/10 pt-2">
                <Row label="Total" value={dollars(bill.totalCents)} bold />
                {bill.amountPaidCents > 0 ? (
                  <Row
                    label="Paid"
                    value={`− ${dollars(bill.amountPaidCents)}`}
                  />
                ) : null}
                <Row
                  label="Remaining"
                  value={dollars(bill.amountDueCents)}
                  bold
                />
              </div>
            </div>

            <BillSplitScreen
              qrToken={params.qrToken}
              slug={resolved.slug}
              billId={bill.id}
              sessionId={resolved.sessionId}
              sessionToken={resolved.sessionToken}
              amountDueCents={bill.amountDueCents}
              items={bill.items.map<BillItemRow>(it => ({
                id: it.id,
                nameSnapshot: it.nameSnapshot,
                priceCents: it.priceCents,
                quantity: it.quantity,
                status: it.status,
              }))}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between py-1",
        bold ? "font-medium text-slate" : "text-slate/65",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function InvalidScan({ reason }: { reason: string }) {
  return (
    <main className="flex flex-1 flex-col text-slate">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium">QR code expired</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate/60">
            Ask your server for a fresh code, or speak with them directly.
          </p>
          <p className="mt-6 font-mono text-[10px] tracking-wider text-slate/30">
            {reason}
          </p>
        </div>
      </div>
    </main>
  );
}
