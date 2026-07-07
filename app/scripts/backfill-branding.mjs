/**
 * Backfill legacy Venue branding fields into VenueBranding rows
 * (restructure P3.3): for every venue with any of brandColor / logoUrl /
 * guestWelcomeMessage set, upsert a VenueBranding row filling ONLY the
 * fields that are currently null there — explicit V2 values always win.
 * Idempotent; re-running is a no-op.
 *
 *   bun run db:backfill-branding            (local — guarded)
 *   ALLOW_REMOTE_DB=1 ... (conscious prod run, see RUNBOOK)
 *
 * The guest surfaces resolve through resolveBrandingWithFallback either
 * way, so this backfill changes NOTHING visible — it moves the data so
 * the legacy columns can eventually stop being read at all.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const venues = await db.venue.findMany({
    where: {
      OR: [
        { brandColor: { not: null } },
        { logoUrl: { not: null } },
        { guestWelcomeMessage: { not: null } },
      ],
    },
    select: {
      id: true,
      slug: true,
      brandColor: true,
      logoUrl: true,
      guestWelcomeMessage: true,
      venueBranding: true,
    },
  });

  let created = 0;
  let updated = 0;
  let untouched = 0;

  for (const v of venues) {
    const b = v.venueBranding;
    if (!b) {
      await db.venueBranding.create({
        data: {
          venueId: v.id,
          primaryColor: v.brandColor,
          logoUrl: v.logoUrl,
          welcomeMessage: v.guestWelcomeMessage,
        },
      });
      created += 1;
      continue;
    }
    const patch = {};
    if (b.primaryColor === null && v.brandColor !== null) patch.primaryColor = v.brandColor;
    if (b.logoUrl === null && v.logoUrl !== null) patch.logoUrl = v.logoUrl;
    if (b.welcomeMessage === null && v.guestWelcomeMessage !== null) {
      patch.welcomeMessage = v.guestWelcomeMessage;
    }
    if (Object.keys(patch).length === 0) {
      untouched += 1;
      continue;
    }
    await db.venueBranding.update({ where: { venueId: v.id }, data: patch });
    updated += 1;
  }

  console.log(
    JSON.stringify({ ok: true, candidates: venues.length, created, updated, untouched }),
  );
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
