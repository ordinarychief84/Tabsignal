import { NextResponse } from "next/server";
import { aggregateForDate } from "@/lib/benchmarks";
import { env } from "@/lib/env";

// Vercel Cron handler. Runs nightly to aggregate yesterday's benchmark
// snapshots. Bearer-gated by BENCHMARK_CRON_SECRET — Vercel Cron sends
// this in the Authorization header.
//
// Idempotent: re-running for the same date upserts; downstream consumers
// won't see partial updates because each snapshot row is written atomically.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const expected = env.BENCHMARK_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Process yesterday by default. Optional `?date=YYYY-MM-DD` for backfills.
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  let target: Date;
  if (dateParam) {
    target = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(target.getTime())) {
      return NextResponse.json({ error: "BAD_DATE" }, { status: 400 });
    }
  } else {
    target = new Date();
    target.setDate(target.getDate() - 1);
  }
  target.setHours(0, 0, 0, 0);

  const result = await aggregateForDate(target);
  return NextResponse.json({
    date: target.toISOString().slice(0, 10),
    ...result,
  });
}
