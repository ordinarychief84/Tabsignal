/**
 * Redirect-helper functions used by the magic-link callback. Extracted from
 * the route handler so they can be unit-tested without booting the
 * Next.js request lifecycle.
 *
 * - originFromRequest: trust Host / x-forwarded-host so dev binding to
 *   0.0.0.0 doesn't produce phone-unreachable redirects.
 * - safeNext: same-origin path validation. Rejects absolute and
 *   protocol-relative URLs to prevent open-redirect exploits via the
 *   `next` query param or JWT claim.
 */

export function originFromRequest(req: Request): string {
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = fwdHost ?? req.headers.get("host");
  if (host) {
    const proto =
      fwdProto ??
      (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * Same-origin path redirect validator.
 *
 * Returns `defaultDest` unless `next` is a same-origin path. Rejects:
 *  - empty / undefined / null
 *  - protocol-relative URLs ("//evil.com/...")
 *  - absolute URLs ("https://evil.com/...")
 *  - backslash-host injection ("/\\evil.com")  — modern browsers strip
 *    leading `\` and treat it as a host
 *  - javascript: scheme (defensive even though redirect won't execute it)
 *
 * Accepts:
 *  - any path starting with a single forward slash followed by a path
 *    char (letter, digit, dash, underscore, dot, hash, question mark)
 */
export function safeNext(
  next: string | null | undefined,
  defaultDest = "/staff",
): string {
  if (!next) return defaultDest;
  if (typeof next !== "string") return defaultDest;
  if (!next.startsWith("/")) return defaultDest;
  // Block protocol-relative URLs in any whitespace-tolerant form.
  if (next.startsWith("//")) return defaultDest;
  // Block backslash-host injection: browsers treat `/\\` as a host
  // separator in URL parsing.
  if (next.startsWith("/\\")) return defaultDest;
  // Block scheme-prefixed values that happen to start with a slash —
  // for example "/javascript:alert(1)". Belt and braces: a redirect
  // Response would not run JS, but we still don't want the URL stored
  // in browser history.
  const lower = next.toLowerCase();
  if (lower.startsWith("/javascript:") || lower.startsWith("/data:")) {
    return defaultDest;
  }
  return next;
}
