/**
 * Next.js auto-loads this file before any user code. Used to wire
 * server-side observability. Sentry init is gated on SENTRY_DSN — if
 * the env var is absent (dev, or before the org's Sentry project
 * exists), we no-op so we don't throw at boot.
 *
 * Add SENTRY_DSN in Vercel Project Settings → Environment Variables
 * to turn this on. Same DSN works for client + server + edge.
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  const env = process.env.NEXT_RUNTIME;
  if (env === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
    });
  }

  if (env === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA,
    });
  }
}
