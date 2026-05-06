import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { TentSheet } from "./tent-sheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — QR tents" };

/**
 * Derive the base URL from the request's Host header so the QR codes
 * always encode whatever the manager is currently using to reach the app.
 * Falls back to PUBLIC_QR_BASE_URL only if no host header is available.
 *
 * Why: in dev the Mac's LAN IP changes whenever WiFi changes. Pinning a
 * URL in env once means scanned QRs go stale. Reading the host means
 * "open the QR tents page from your phone's browser, print, place" — the
 * QR matches whichever URL got the manager here.
 */
function resolveBase(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "http");
  if (host) return `${proto}://${host}`;
  return process.env.PUBLIC_QR_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
}

export default async function QrTentsPage({ params }: { params: { slug: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/admin/v/${params.slug}/qr-tents`);

  const QR_BASE = resolveBase();

  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    include: { tables: { orderBy: { label: "asc" } } },
  });
  if (!venue) notFound();
  if (venue.id !== session.venueId) {
    return (
      <main className="mx-auto max-w-md p-8 text-center text-sm text-slate/65">
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
