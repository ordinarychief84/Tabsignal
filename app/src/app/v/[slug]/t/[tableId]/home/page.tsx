import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveGuestSession } from "@/domain/sessions/resolve";
import { getVenueBranding, resolveBrandingWithFallback } from "@/lib/branding";
import { serverForTable } from "@/lib/server-identity";
import { guestExperienceFrom } from "@/lib/guest-experience";
import { availablePrompts } from "@/lib/menu-discovery";
import { chefsPickRound } from "@/lib/chefs-pick";
import { GuestHome } from "./guest-home";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { slug: string; tableId: string };
  searchParams: { s?: string; tab?: string };
};

/**
 * The guest home: discovery, specials, and the picks they're building.
 *
 * Everything a guest can do here is browsing or signalling. Nothing here
 * places an order or moves money — the POS still owns taking the order,
 * the bill and the payment, and "Ready to order" tells the server the
 * table is ready for them rather than submitting anything.
 *
 * Loaded in one server pass so a phone on restaurant wifi renders once
 * rather than waterfalling four fetches.
 */
export default async function GuestHomePage({ params, searchParams }: PageProps) {
  const tableSeg = safeDecode(params.tableId);
  let resolved;
  try {
    resolved = await resolveGuestSession(params.slug, tableSeg, searchParams.s ?? null);
  } catch {
    notFound();
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
      timezone: true,
    },
  });
  if (!venue) notFound();

  const config = guestExperienceFrom(venue.enabledFeatures);
  const now = new Date();

  const [items, categories, promotions, specials, wishlist, tablePickRows] = await Promise.all([
    db.menuItem.findMany({
      where: { venueId: resolved.venueId, isActive: true },
      select: {
        id: true, name: true, description: true, priceCents: true,
        imageUrl: true, isFeatured: true, tags: true, categoryId: true,
      },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      take: 300,
    }),
    db.menuCategory.findMany({
      where: { venueId: resolved.venueId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    config.specials
      ? db.promotion.findMany({
          where: {
            venueId: resolved.venueId,
            status: "ACTIVE",
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          select: {
            id: true, title: true, description: true, type: true,
            startsAt: true, endsAt: true,
            items: { select: { menuItemId: true } },
          },
          orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
          take: 8,
        })
      : Promise.resolve([]),
    config.specials
      ? db.venueSpecial.findMany({
          where: { venueId: resolved.venueId },
          select: { id: true, title: true, description: true },
          take: 6,
        })
      : Promise.resolve([]),
    config.myPicks
      ? db.wishlist.findUnique({
          where: { guestSessionId: resolved.sessionId },
          select: { items: { select: { menuItemId: true, quantity: true, notes: true } } },
        })
      : Promise.resolve(null),
    // Table Picks: every live session at THIS table, aggregated. Identities
    // never leave the database — only counts come back.
    config.tablePicks
      ? db.wishlistItem.findMany({
          where: {
            wishlist: {
              tableId: resolved.tableId,
              status: "ACTIVE",
              guestSession: { expiresAt: { gt: now }, paidAt: null },
            },
          },
          select: { menuItemId: true, quantity: true },
        })
      : Promise.resolve([]),
  ]);

  // Venue-authored pairings. Loaded whole — a menu is a few hundred rows
  // at most and this saves a round trip from a phone on venue wifi every
  // time the guest saves something.
  //
  // Nothing is inferred here or anywhere else: TabCall has no basket and
  // no bill, so the only thing it can say about what goes with what is
  // what the venue wrote down. A venue that authored none gets an empty
  // array and no suggestion module at all.
  const pairings = await db.menuItemPairing.findMany({
    where: { venueId: resolved.venueId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { menuItemId: true, suggestedId: true, relationship: true, sortOrder: true },
    take: 500,
  });

  // An open request of this guest's, resolved here rather than left to
  // the client. Loading the page already tells us the session; asking the
  // database in the same pass means the status card is correct on first
  // paint instead of appearing a poll later — and means a refresh mid-wait
  // doesn't erase the fact that they asked for something.
  const activeRequest = venue.requestsEnabled
    ? await db.request.findFirst({
        where: {
          sessionId: resolved.sessionId,
          status: { in: ["PENDING", "ACKNOWLEDGED", "ESCALATED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, type: true, status: true, note: true,
          createdAt: true, acknowledgedAt: true,
        },
      })
    : null;

  // Seeded on the session so the round is stable if the guest taps back
  // into it, and differs between tables.
  const chefsPick = config.specials
    ? await chefsPickRound({ venueId: resolved.venueId, seed: resolved.sessionId })
    : null;

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

  // Aggregate table interest by item. Counts only — never who.
  const tableTotals = new Map<string, number>();
  for (const row of tablePickRows) {
    tableTotals.set(row.menuItemId, (tableTotals.get(row.menuItemId) ?? 0) + row.quantity);
  }

  return (
    <GuestHome
      venueSlug={params.slug}
      tableSeg={params.tableId}
      sessionToken={resolved.sessionToken}
      sessionId={resolved.sessionId}
      venueName={resolved.venueName}
      tableLabel={resolved.tableLabel}
      serverName={server?.displayName ?? null}
      brandColor={branding.primaryColor ?? venue.brandColor}
      greeting={greetingFor(now, venue.timezone)}
      items={items.map(i => ({
        id: i.id,
        name: i.name,
        description: i.description,
        priceCents: i.priceCents,
        imageUrl: i.imageUrl,
        isFeatured: i.isFeatured,
        tags: i.tags,
        categoryId: i.categoryId,
      }))}
      categories={categories}
      prompts={config.menuDiscovery ? availablePrompts(items) : []}
      chefsPick={chefsPick}
      promotions={promotions.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        type: p.type,
        endsAt: p.endsAt?.toISOString() ?? null,
        itemIds: p.items.map(i => i.menuItemId),
      }))}
      specials={specials}
      picks={(wishlist?.items ?? []).map(i => ({
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        notes: i.notes,
      }))}
      tablePicks={[...tableTotals.entries()].map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
      }))}
      config={{
        menuDiscovery: config.menuDiscovery,
        specials: config.specials,
        myPicks: config.myPicks,
        tablePicks: config.tablePicks,
        feedback: config.feedback,
      }}
      requestsEnabled={venue.requestsEnabled}
      feedbackHref={
        config.feedback
          ? `/v/${params.slug}/t/${params.tableId}/feedback?s=${encodeURIComponent(searchParams.s ?? "")}`
          : undefined
      }
      pairings={pairings}
      initialTab={searchParams.tab ?? "for-you"}
      activeRequest={
        activeRequest
          ? {
              id: activeRequest.id,
              type: activeRequest.type,
              status: activeRequest.status,
              note: activeRequest.note,
              createdAt: activeRequest.createdAt.toISOString(),
              acknowledgedAt: activeRequest.acknowledgedAt?.toISOString() ?? null,
            }
          : null
      }
    />
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * "Good evening, Table 12" — in the VENUE's timezone, not the phone's. A
 * guest whose phone is still on another timezone should not be told good
 * morning at dinner.
 */
function greetingFor(now: Date, timezone: string): string {
  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: timezone })
        .format(now),
    );
  } catch {
    hour = now.getHours();
  }
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
