/**
 * Shared constants for the operator-impersonation flow. Lives outside
 * the route files because Next.js refuses named exports from route.ts
 * other than HTTP method handlers and a small set of config keys.
 *
 * The stash cookie holds the operator's original session JWT while
 * they're impersonating a venue's staff member, so the "Return to
 * operator" CTA can swap it back without forcing a re-login.
 */

export const IMPERSONATION_STASH_COOKIE =
  "tabsignal_operator_session_before_impersonation";
