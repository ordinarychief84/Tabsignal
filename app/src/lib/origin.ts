/**
 * Resolve the origin for outbound URLs (magic links, comp links, return URLs).
 *
 * Prefers APP_URL env. Falls back to request headers ONLY in dev — in prod a
 * misconfigured proxy could let an attacker inject a phishing host into a
 * legitimate-looking magic-link email.
 */
export function appOrigin(req?: Request): string {
  const fromEnv = process.env.APP_URL?.replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  if (req) {
    const fwdProto = req.headers.get("x-forwarded-proto");
    const fwdHost = req.headers.get("x-forwarded-host");
    const host = fwdHost ?? req.headers.get("host");
    if (host) {
      const proto =
        fwdProto ??
        (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  return "http://localhost:3000";
}
