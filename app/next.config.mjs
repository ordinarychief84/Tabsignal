/**
 * Content-Security-Policy.
 *
 * Report-only for now: TabCall loads Stripe.js, Firebase messaging, and a
 * Sentry ingest endpoint, and a mis-scoped directive would break checkout
 * — the single worst thing to discover in production. Ship it reporting,
 * watch Sentry for violations, then flip REPORT_ONLY off.
 *
 * 'unsafe-inline' on script-src is required by Next 14's inlined bootstrap
 * and hydration data. Removing it needs the nonce-based CSP that landed in
 * Next 15, so it comes with that upgrade rather than before it.
 */
const CSP_REPORT_ONLY = true;

const csp = [
  "default-src 'self'",
  // Stripe.js + Firebase messaging SDK are loaded from their own origins.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Venue logos and banners live in Supabase Storage; QR codes render as
  // data: URIs; Google review avatars come from googleusercontent.
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
  // XHR/WebSocket: our own API, the Fastify realtime service, Stripe,
  // Firebase, and Sentry ingest.
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.ingest.sentry.io https://*.googleapis.com wss: https:",
  // Stripe Elements and the Connect onboarding flow render in iframes.
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Belt and braces with X-Frame-Options below — this is the directive
  // modern browsers actually honor.
  "frame-ancestors 'none'",
];

// `upgrade-insecure-requests` is ignored in a report-only policy and the
// browser logs an error saying so — on every page load. It only earns its
// place once the CSP is enforced; HSTS already covers us until then.
if (!CSP_REPORT_ONLY) csp.push("upgrade-insecure-requests");

const cspHeader = csp.join("; ");

const securityHeaders = [
  // Clickjacking: the staff and admin dashboards carry one-tap destructive
  // actions (comp, void, refund, delete staff), so nothing may frame us.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No route asks for camera, mic, or geolocation. Denying by default
  // means an injected script can't prompt a guest for them either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Vercel sets HSTS on its own domains, but a custom domain served
  // through another edge would not get it. Declaring it is free.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: CSP_REPORT_ONLY ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
    value: cspHeader,
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework — it's free reconnaissance for anyone
  // matching known Next.js CVEs against a target list.
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  async headers() {
    return [
      {
        // Every route, including /api and the guest QR surfaces.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
