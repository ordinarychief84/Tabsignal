import Stripe from "stripe";
import { NextResponse } from "next/server";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pin a stable API version to avoid drift on Stripe SDK upgrades.
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return client;
}

/**
 * Convert a thrown Stripe SDK error into a NextResponse with a stable shape.
 * Use as the catch-arm of every `await stripe()...create()` (or update) so a
 * Stripe outage / declined card / invalid price ID surfaces as a clear 502
 * to the client instead of leaking the SDK stack via Next's default 500.
 *
 *   try { ... await stripe().paymentIntents.create(...) ... }
 *   catch (err) { return stripeErrorResponse(err, "[payment]"); }
 */
export function stripeErrorResponse(err: unknown, logTag = "[stripe]"): NextResponse {
  const e = err as {
    type?: string;
    code?: string;
    statusCode?: number;
    message?: string;
    raw?: { message?: string };
  };
  const detail = e.raw?.message ?? e.message ?? "Stripe request failed.";
  // Stripe's HTTP status (e.g. 402 declined, 400 invalid request) is the most
  // useful status to bubble; default to 502 (bad gateway) when absent.
  const status =
    typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600
      ? e.statusCode
      : 502;
  console.error(`${logTag} stripe error`, { type: e.type, code: e.code, status, detail });
  return NextResponse.json(
    {
      error: "STRIPE_ERROR",
      type: e.type ?? "unknown_error",
      code: e.code ?? null,
      detail,
    },
    { status },
  );
}
