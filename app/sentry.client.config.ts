/**
 * Browser-side Sentry. Loaded automatically by `@sentry/nextjs` via
 * the framework hook. Same DSN as server. Stays inert when
 * NEXT_PUBLIC_SENTRY_DSN is unset so dev / preview without an org
 * Sentry project still build cleanly.
 *
 * Note: client-side env vars must be `NEXT_PUBLIC_…`-prefixed to be
 * inlined at build time. We accept either NEXT_PUBLIC_SENTRY_DSN or
 * SENTRY_DSN as a fallback (Sentry's plugin can rewrite this), but
 * only the public-prefixed one gets shipped to the browser.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Don't capture noisy network errors from blockers / extensions.
    ignoreErrors: ["ResizeObserver loop limit exceeded", "Non-Error promise rejection captured"],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
