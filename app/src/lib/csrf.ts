/**
 * Origin / Sec-Fetch-Site enforcement helper for state-changing routes.
 *
 * Rationale: the session cookie is HttpOnly + Secure + SameSite=Strict,
 * which blocks most CSRF surfaces in modern browsers. But:
 *   - Older Firefox versions interpret SameSite less strictly.
 *   - Some embedded WebViews (in-app browsers) still send credentials
 *     on cross-origin top-level navigations.
 *   - Form-encoded POSTs from a malicious top-level navigation are not
 *     reliably blocked by Lax.
 *
 * Defense in depth: also assert the request's Origin (or Sec-Fetch-Site
 * for browsers that send it) matches our app origin. The Stripe webhook
 * route is exempt (Stripe verifies its own signature) and the magic-link
 * callback is GET-only.
 *
 * Public guest POSTs (e.g. /api/requests with sessionToken) intentionally
 * NOT covered by this helper — they're protected by the session-token
 * check, and a guest browser may be embedded in a wallet WebView that
 * strips Origin headers. Apply this helper only to cookie-authenticated
 * state-changing routes (admin/operator/staff actions).
 */

// Lazy + cached. Reading `process.env` at module-load time hard-codes the
// allowlist before tests (or any later env mutation) can influence it.
// We compute on first call, then memoise — env doesn't change at runtime
// in production, but in test the cache can be cleared via `_resetOriginAllowlistForTest`.
let cached: Set<string> | null = null;

function appOriginAllowlist(): Set<string> {
  if (cached) return cached;
  const set = new Set<string>();
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try { set.add(new URL(appUrl).origin); } catch { /* ignore */ }
  }
  // Allow APP_URL aliases — useful for Vercel preview deploys where
  // the preview URL differs from APP_URL. Comma-separated.
  const extra = process.env.ALLOWED_ORIGINS ?? "";
  for (const raw of extra.split(",").map(s => s.trim()).filter(Boolean)) {
    try { set.add(new URL(raw).origin); } catch { /* ignore */ }
  }
  cached = set;
  return set;
}

/** Test-only: drop the cached allowlist so a subsequent `originGuard` recomputes from env. */
export function _resetOriginAllowlistForTest(): void {
  cached = null;
}

export type SameOriginResult =
  | { ok: true }
  | { ok: false; reason: "BAD_ORIGIN" | "MISSING_ORIGIN"; got: string | null };

/**
 * Returns ok=true when the request originates from the app itself (same
 * Origin) OR carries Sec-Fetch-Site=same-origin / same-site. Returns
 * false (BAD_ORIGIN) for a clearly cross-origin caller, and false
 * (MISSING_ORIGIN) when we have no way to decide — caller decides
 * whether to fail-open or fail-closed (we default to closed in prod).
 */
export function checkSameOrigin(req: Request): SameOriginResult {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const fetchSite = req.headers.get("sec-fetch-site");

  // Sec-Fetch-Site is set by every browser that supports it on every
  // outgoing fetch — it's the most authoritative signal we have.
  if (fetchSite) {
    if (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none") {
      // "none" = address-bar typed, RSC navigation — same-origin by definition.
      return { ok: true };
    }
    return { ok: false, reason: "BAD_ORIGIN", got: fetchSite };
  }

  // Older clients / WebViews: fall back to Origin header.
  if (origin) {
    if (appOriginAllowlist().has(origin)) return { ok: true };
    return { ok: false, reason: "BAD_ORIGIN", got: origin };
  }

  // Referer is the last resort — easy to strip but better than nothing.
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (appOriginAllowlist().has(refOrigin)) return { ok: true };
      return { ok: false, reason: "BAD_ORIGIN", got: refOrigin };
    } catch {
      /* fall through */
    }
  }

  return { ok: false, reason: "MISSING_ORIGIN", got: null };
}

/**
 * Convenience wrapper for use at the top of a route handler. Returns a
 * NextResponse-shape object the caller can return directly when the
 * check fails, or null when the check passed.
 *
 * In dev (NODE_ENV !== production) we fail-open on MISSING_ORIGIN to
 * keep curl/Postman testing fast; in prod we fail-closed.
 */
export function originGuard(
  req: Request,
): { error: string; detail: string; status: number } | null {
  const result = checkSameOrigin(req);
  if (result.ok) return null;
  if (result.reason === "MISSING_ORIGIN" && process.env.NODE_ENV !== "production") {
    return null;
  }
  return {
    error: "CSRF_BLOCKED",
    detail: `Origin check failed: ${result.reason}${result.got ? ` (${result.got})` : ""}`,
    status: 403,
  };
}
