import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveGuestSession } from "@/domain/sessions/resolve";
import { getVenueBranding, resolveBrandingWithFallback } from "@/lib/branding";
import { serverForTable } from "@/lib/server-identity";
import { returningGuestFor, welcomeBackLine } from "@/lib/returning-guest";
import { guestExperienceFrom } from "@/lib/guest-experience";
import { GuestEntry } from "./guest-entry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string };
};

/**
 * Where a scan lands.
 *
 * This used to open straight onto the signal beacon — a utility surface,
 * first thing, before the guest had been greeted by anything. Someone who
 * has just sat down in a room they chose gets a welcome instead: the
 * venue's name, where they're sitting, and the person looking after them.
 *
 * The beacon isn't gone; it moved. Calling a server is now the one control
 * docked on every screen of the guest experience (see ServiceSheet), which
 * makes it more reachable than when it was a whole page you had to be on.
 */
export default async function GuestPage({ params, searchParams }: PageProps) {
  const tableSeg = safeDecode(params.tableId);
  let resolved;
  try {
    resolved = await resolveGuestSession(params.slug, tableSeg, searchParams.s ?? null);
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "UNKNOWN";
    if (code === "VENUE_NOT_FOUND" || code === "TABLE_NOT_FOUND") notFound();
    return <InvalidScan reason={code} />;
  }

  const venue = await db.venue.findUnique({
    where: { id: resolved.venueId },
    select: {
      name: true,
      brandColor: true,
      logoUrl: true,
      guestWelcomeMessage: true,
      enabledFeatures: true,
      requestsEnabled: true,
    },
  });
  if (!venue) notFound();

  const config = guestExperienceFrom(venue.enabledFeatures);
  const branding = resolveBrandingWithFallback(
    {
      brandColor: venue.brandColor,
      logoUrl: venue.logoUrl,
      guestWelcomeMessage: venue.guestWelcomeMessage,
    },
    await getVenueBranding(resolved.venueId),
  );

  const server = await serverForTable({
    tableId: resolved.tableId,
    venueName: resolved.venueName,
    venueWelcomeMessage: branding.welcomeMessage ?? venue.guestWelcomeMessage,
  });

  // Only for a guest who verified a phone number at some point and still
  // carries the cookie from it. No fingerprinting — see lib/returning-guest.
  const returning = await returningGuestFor({
    venueId: resolved.venueId,
    sessionId: resolved.sessionId,
  });

  return (
    <GuestEntry
      welcomeBack={returning ? welcomeBackLine(returning, resolved.venueName) : null}
      venueName={resolved.venueName}
      tableLabel={resolved.tableLabel}
      server={
        server
          ? {
              displayName: server.displayName,
              // A venue can switch server photos off without unsetting them.
              photoUrl: config.serverPhoto ? server.photoUrl : null,
              welcomeMessage: server.welcomeMessage,
            }
          : null
      }
      // `?s=` is the QR token on EVERY page of the table surface, which is
      // what resolveGuestSession validates against. Passing the session
      // token here instead sent the guest's primary call to action —
      // "Explore the menu" — straight to a dead end.
      homeHref={`/v/${params.slug}/t/${params.tableId}/home?s=${encodeURIComponent(searchParams.s ?? "")}`}
      sessionToken={resolved.sessionToken}
      sessionId={resolved.sessionId}
      venueSlug={params.slug}
      brandColor={branding.primaryColor ?? venue.brandColor}
      showWelcome={config.welcome}
      requestsEnabled={venue.requestsEnabled}
      feedbackHref={
        config.feedback
          ? `/v/${params.slug}/t/${params.tableId}/feedback?s=${encodeURIComponent(searchParams.s ?? "")}`
          : undefined
      }
    />
  );
}

/** Table segments arrive URL-encoded ("Table%2012"). */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function InvalidScan({ reason }: { reason: string }) {
  const copy =
    reason === "INVALID_TOKEN"
      ? "That code doesn't match this table. Ask a member of staff for a fresh one."
      : "We couldn't read that code. Ask a member of staff for a fresh one.";
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-oat px-6 text-center">
      <div className="max-w-sm">
        <p className="text-3xl" aria-hidden>·</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate">
          That scan didn&rsquo;t work
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate/60">{copy}</p>
      </div>
    </main>
  );
}
