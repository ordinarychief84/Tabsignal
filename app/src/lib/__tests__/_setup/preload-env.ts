/**
 * Test-runner preload. Parses `@/lib/env` ONCE, early, in a known-good
 * state — before any test file can change the environment underneath it.
 *
 * Why this exists
 * ---------------
 * `lib/env.ts` validates at module load, and it validates *differently*
 * depending on `NODE_ENV`: production additionally requires the Stripe,
 * Resend and Upstash block. Several suites legitimately set
 * `NODE_ENV=production` to test fail-closed behaviour (csrf's
 * MISSING_ORIGIN, the rate limiter's no-Upstash posture).
 *
 * Whichever test file imports `lib/env` FIRST decides how it parses, and
 * that file is chosen by readdir order — which differs between macOS and
 * Linux CI. So a suite that merely imports something that transitively
 * pulls in `lib/env` (review-reply reaches it via lib/pos/crypto) would
 * pass locally and fail on CI with either "Missing required env" or
 * "Missing production env", depending on who ran first.
 *
 * Importing it here, with defaults filled in and NODE_ENV untouched,
 * pins the parse to a valid result and caches it for the whole run. Test
 * files stay free to flip NODE_ENV afterwards; the module is already
 * resolved, so nothing re-parses.
 *
 * Same family as preserve-rate-limit.ts: bun's module registry is
 * process-wide, so preload is the only place a guarantee like this can
 * be made.
 */

// Marks the file as a module so the top-level await below is legal.
export {};

const env = process.env as Record<string, string>;

// Defaults, never overrides — a real .env value still wins, so this
// can't mask a genuine misconfiguration in local dev.
env.NEXTAUTH_SECRET ??= "test-secret-must-be-at-least-32-characters-long-for-zod";
env.DATABASE_URL ??= "postgresql://test@localhost:5432/test";
env.DIRECT_URL ??= "postgresql://test@localhost:5432/test";
env.APP_URL ??= "https://tab-call.test";
env.FASTIFY_INTERNAL_URL ??= "https://realtime.tab-call.test";
env.INTERNAL_API_SECRET ??= "test-internal-secret-at-least-16";
env.NEXT_PUBLIC_SOCKET_URL ??= "https://realtime.tab-call.test";

// Force the parse now, while the above holds and NODE_ENV is whatever
// the runner started with (never "production" at preload time).
await import("@/lib/env");
