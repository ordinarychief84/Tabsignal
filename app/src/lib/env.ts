import { z } from "zod";

/**
 * Validate required env vars at module load time. Imported anywhere — the
 * first import at server boot triggers Zod parsing, and a missing var
 * crashes the deploy instead of silently 500-ing on a real user request.
 *
 * Treats DEV vs PROD slightly differently: in dev some integrations are
 * optional (no Stripe webhook secret yet, no Anthropic budget, etc.) so
 * we warn rather than reject. In prod every var must be present.
 */

const isProd = process.env.NODE_ENV === "production";

const Required = z.object({
  // Postgres
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // App
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be ≥32 chars"),
  APP_URL: z.string().url(),

  // Realtime
  FASTIFY_INTERNAL_URL: z.string().url(),
  INTERNAL_API_SECRET: z.string().min(16, "INTERNAL_API_SECRET must be ≥16 chars"),
  NEXT_PUBLIC_SOCKET_URL: z.string().url(),
});

const Optional = z.object({
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  // Resend
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),

  // Operator
  OPERATOR_EMAILS: z.string().optional(),

  // Twilio (reservations + waitlist + loyalty OTP). Optional in dev — the
  // SMS adapter mocks when these are absent.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // Benchmarks cron — bearer token gating /api/cron/benchmarks. Optional
  // in dev (the cron only runs in prod via Vercel Cron).
  BENCHMARK_CRON_SECRET: z.string().optional(),
});

const ProdRequired = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(live|test)_/),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().regex(/^pk_(live|test)_/),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/),
  ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-/),
  RESEND_API_KEY: z.string().regex(/^re_/),
  RESEND_FROM: z.string().email().refine(
    s => !s.endsWith("@resend.dev"),
    "RESEND_FROM in production must be a verified domain — onboarding@resend.dev only delivers to verified test addresses",
  ),
});

function parseEnv() {
  const required = Required.safeParse(process.env);
  if (!required.success) {
    const issues = required.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("\n  ");
    throw new Error(`Missing required env:\n  ${issues}`);
  }
  const optional = Optional.parse(process.env);

  if (isProd) {
    const prod = ProdRequired.safeParse(process.env);
    if (!prod.success) {
      const issues = prod.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("\n  ");
      throw new Error(`Missing production env:\n  ${issues}`);
    }
  }

  return { ...required.data, ...optional };
}

export const env = parseEnv();
