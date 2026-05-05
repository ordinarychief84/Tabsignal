import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { TentSheet } from "./tent-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabSignal — QR tents" };

const QR_BASE = process.env.PUBLIC_QR_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";

export default async function QrTentsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/qr-tents`);

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    include: { tables: { orderBy: { label: "asc" } } },
  });
  if (!venue) notFound();
  if (venue.id !== session.venueId) {
    return (
      <main className="mx-auto max-w-md p-8 text-center text-sm text-slate-600">
        You&rsquo;re signed in to a different venue.
      </main>
    );
  }

  const tents = await Promise.all(
    venue.tables.map(async t => {
      const url = `${QR_BASE}/v/${venue.slug}/t/${encodeURIComponent(t.label)}?s=${encodeURIComponent(t.qrToken)}`;
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      return { label: t.label, zone: t.zone, url, svg };
    })
  );

  return (
    <TentSheet
      venueName={venue.name}
      brandColor={venue.brandColor ?? "#1D9E75"}
      tents={tents}
    />
  );
}
