import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gbpEnabled, syncVenueReviews } from "@/domain/reviews/gbp";

export const maxDuration = 300;

/**
 * GET /api/cron/reviews-sync — nightly Google-review pull for every
 * CONNECTED venue. Same bearer model as /api/cron/benchmarks and
 * /api/cron/escalate (one shared cron trust boundary), oldest-synced
 * first, capped per run so quota problems degrade to staleness instead
 * of failures.
 */
const PER_RUN_CAP = 25;

export async function GET(req: Request) {
  const expected = process.env.BENCHMARK_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  const provided = req.headers.get("authorization");
  if (provided !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!gbpEnabled()) {
    return NextResponse.json({ ok: true, skipped: "GBP_NOT_CONFIGURED" });
  }

  const connections = await db.gbpConnection.findMany({
    where: { status: { in: ["CONNECTED", "ERROR"] }, encryptedRefreshToken: { not: null } },
    orderBy: [{ lastSyncAt: { sort: "asc", nulls: "first" } }],
    take: PER_RUN_CAP,
    select: { venueId: true },
  });

  let ok = 0;
  let failed = 0;
  for (const conn of connections) {
    const result = await syncVenueReviews(conn.venueId);
    if ("error" in result) failed += 1;
    else ok += 1;
  }

  return NextResponse.json({ ok: true, venues: connections.length, synced: ok, failed });
}
