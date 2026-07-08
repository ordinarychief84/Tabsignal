import "server-only";
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
// `next build` sets NODE_ENV=production, but the build itself runs in CI/local
// without real prod secrets. Strict prod validation belongs at runtime, not at
// bundle time — otherwise `next build` becomes a wall that blocks shipping.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

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

// Optional integration vars. Two hard-won rules encoded here:
//
//   1. `""` (or whitespace) counts as ABSENT. Vercel's dashboard and
//      copied .env templates routinely leave optional vars as empty
//      strings; `z.string().email().optional()` rejects "" and a single
//      empty placeholder used to kill `next build` (and would 500 every
//      route at runtime, since this module parses at import).
//   2. A malformed value must only disable ITS integration, never the
//      app. parseOptionalEnv() below validates field-by-field, warns,
//      and drops bad values instead of throwing.
const emptyAsAbsent = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;
const optionalString = z.preprocess(emptyAsAbsent, z.string().optional());
const optionalEmail = z.preprocess(emptyAsAbsent, z.string().email().optional());
const optionalUrl = z.preprocess(emptyAsAbsent, z.string().url().optional());

const Optional = z.object({
  // Stripe
  STRIPE_SECRET_KEY: optionalString,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  // Anthropic
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: optionalString,

  // Resend
  RESEND_API_KEY: optionalString,
  RESEND_FROM: optionalString,

  // Operator
  OPERATOR_EMAILS: optionalString,

  // Twilio (reservations + waitlist + loyalty OTP). Optional in dev — the
  // SMS adapter mocks when these are absent.
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM_NUMBER: optionalString,

  // Benchmarks cron — bearer token gating /api/cron/benchmarks. Optional
  // in dev (the cron only runs in prod via Vercel Cron).
  BENCHMARK_CRON_SECRET: optionalString,

  // Phase 2 billing cutover stage (restructure plan). Absent = "off".
  //   off       — legacy JSON tab only (today's behavior)
  //   dualwrite — mutations also mirror into Bill/BillItem; JSON canonical
  //   canonical — new sessions write the V2 model as source of truth
  // Every flip is one redeploy; see domain/billing/mirror.ts.
  BILLING_V2: z.preprocess(emptyAsAbsent, z.enum(["off", "dualwrite", "canonical"]).optional()),

  // Google OAuth sign-in (lib/auth/oauth-google). Both absent = feature
  // invisible ("Continue with Google" hidden, /api/auth/google/start
  // returns 503). The client id is not sensitive; the secret is
  // server-only (fenced + pinned by server-only-coverage.test.ts).
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Supabase Storage. NEXT_PUBLIC_SUPABASE_URL + the service role key
  // power server-side image uploads (venue logos, etc.). Service role is
  // server-only — never expose to the browser. Optional in dev: the
  // upload endpoint surfaces a clear "not configured" error if missing.
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  // Firebase Cloud Messaging — server credentials. Required to push to
  // backgrounded staff PWAs; optional everywhere (lib/fcm.ts warns and
  // no-ops when absent). The private key is stored with literal "\n"
  // sequences in Vercel and converted to real newlines at read time.
  FIREBASE_PROJECT_ID: optionalString,
  FIREBASE_CLIENT_EMAIL: optionalEmail,
  FIREBASE_PRIVATE_KEY: optionalString,

  // Firebase web config — public by design (the web SDK publishes these
  // values). The browser registers the SW with these as URL params and
  // mints a token via getToken(). All optional in dev.
  NEXT_PUBLIC_FIREBASE_API_KEY: optionalString,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: optionalString,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_APP_ID: optionalString,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: optionalString,
});

/**
 * Field-by-field tolerant parse of the Optional block. A malformed value
 * (e.g. FIREBASE_CLIENT_EMAIL="tabcall-fcm" — not an email) logs a loud
 * warning and is dropped, disabling only the integration that reads it.
 * Never throws.
 */
function parseOptionalEnv(): z.infer<typeof Optional> {
  const out: Record<string, string | undefined> = {};
  const issues: string[] = [];
  for (const [key, schema] of Object.entries(Optional.shape)) {
    const result = (schema as z.ZodTypeAny).safeParse(process.env[key]);
    if (result.success) {
      if (result.data !== undefined) out[key] = result.data as string;
    } else {
      issues.push(`${key}: ${result.error.errors[0]?.message ?? "invalid"}`);
    }
  }
  if (issues.length > 0) {
    console.warn(
      `[env] Ignoring malformed optional env (the integrations reading these are disabled until fixed):\n  ${issues.join("\n  ")}`,
    );
  }
  return out as z.infer<typeof Optional>;
}

const ProdRequired = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(live|test)_/),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().regex(/^pk_(live|test)_/),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/),
  ANTHROPIC_API_KEY: z.string().regex(/^sk-ant-/),
  RESEND_API_KEY: z.string().regex(/^re_/),
  // Accepts both bare addresses and Resend's display-name form
  // ("TabCall <alerts@tab-call.com>") — .email() alone rejected the
  // latter and would have crashed prod boot on a perfectly valid value.
  RESEND_FROM: z.string().refine(
    s => {
      const addr = /<([^>]+)>\s*$/.exec(s)?.[1] ?? s;
      return z.string().email().safeParse(addr.trim()).success && !addr.trim().endsWith("@resend.dev");
    },
    "RESEND_FROM must be a valid sender (name <email@verified-domain> or bare email); resend.dev only delivers to test addresses",
  ),
  // Required in prod because the rate limiter falls back to an in-memory
  // Map that resets on every Vercel cold start — i.e. effectively no
  // rate-limiting at all. The fallback is fine for dev; production must
  // hit shared Redis. The limiter at lib/rate-limit.ts checks for these
  // env vars and crashes the request when they're absent in prod.
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(20),
});

function parseEnv() {
  const required = Required.safeParse(process.env);
  if (!required.success) {
    const issues = required.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("\n  ");
    // Next.js evaluates every route module during "collect page data" at
    // build time, including modules that import this file. CI / Vercel
    // builds run without runtime secrets — crashing here would block any
    // build that doesn't ship .env.local. Warn instead and let the actual
    // runtime call sites fail loudly if a var is genuinely missing.
    if (isBuildPhase) {
      console.warn(
        `[env] Missing required env at build phase (this is OK for static type-checking — values are read at runtime):\n  ${issues}`,
      );
      // Return a permissive shape so downstream imports don't throw. The
      // values here are never sent to production — Vercel/runtime env wins.
      return {
        DATABASE_URL: process.env.DATABASE_URL ?? "",
        DIRECT_URL: process.env.DIRECT_URL ?? "",
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "",
        APP_URL: process.env.APP_URL ?? "",
        FASTIFY_INTERNAL_URL: process.env.FASTIFY_INTERNAL_URL ?? "",
        INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET ?? "",
        NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL ?? "",
        ...parseOptionalEnv(),
      };
    }
    throw new Error(`Missing required env:\n  ${issues}`);
  }
  const optional = parseOptionalEnv();

  if (isProd && !isBuildPhase) {
    const prod = ProdRequired.safeParse(process.env);
    if (!prod.success) {
      const issues = prod.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("\n  ");
      throw new Error(`Missing production env:\n  ${issues}`);
    }
  }

  return { ...required.data, ...optional };
}

export const env = parseEnv();
