import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";

/**
 * Google OAuth/OIDC — the PURE half (no network). Authorize-URL builder,
 * PKCE, and the two short-lived signed cookies that carry state across
 * the redirect. Network calls (token exchange, id_token/JWKS verify)
 * live in oauth-google-remote.ts so tests can stub the network while
 * exercising real CSRF-state matching.
 *
 * Reuses the app's `jose` + NEXTAUTH_SECRET (same key as the rest of
 * lib/auth) — no new runtime dependency, no next-auth. The feature is
 * invisible unless GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
 */

export const OAUTH_STATE_COOKIE = "tabsignal_oauth_state";
export const OAUTH_PENDING_COOKIE = "tabsignal_oauth_pending";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const STATE_TTL = "10m"; // the whole round-trip should take seconds
const PENDING_TTL = "30m"; // owner fills the venue form after the redirect

function key(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}
export function googleClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
}

/** Feature switch: both halves of the credential must be present. */
export function oauthGoogleEnabled(): boolean {
  return googleClientId() !== null && googleClientSecret() !== null;
}

/** The one redirect URI, derived from the request origin (dev + prod). */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

/* -------------------------------- PKCE --------------------------------- */

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomToken(): string {
  return randomBytes(16).toString("base64url");
}

/* ---------------------------- authorize URL ---------------------------- */

export function buildGoogleAuthUrl(opts: {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const clientId = googleClientId();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  const u = new URL(GOOGLE_AUTHORIZE_URL);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("nonce", opts.nonce);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  // Let the user pick which Google account; online access only (we never
  // call Google APIs after sign-in, so we never want a refresh token).
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

/* ---------------------- state cookie (CSRF + PKCE) --------------------- */

export type OauthStateClaims = {
  kind: "oauth-state";
  state: string;
  nonce: string;
  verifier: string;
  next?: string;
  intent?: string; // "login" | "signup" — display hint only
};

export async function signOauthState(claims: Omit<OauthStateClaims, "kind">): Promise<string> {
  return new SignJWT({ ...claims, kind: "oauth-state" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(key());
}

export async function verifyOauthState(token: string): Promise<OauthStateClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "oauth-state") return null;
    if (typeof payload.state !== "string" || typeof payload.nonce !== "string") return null;
    if (typeof payload.verifier !== "string") return null;
    return payload as unknown as OauthStateClaims;
  } catch {
    return null;
  }
}

/* --------------------- pending cookie (signup handoff) ----------------- */

export type OauthPendingClaims = {
  kind: "oauth-pending";
  sub: string;
  email: string;
  name: string;
};

export async function signOauthPending(claims: Omit<OauthPendingClaims, "kind">): Promise<string> {
  return new SignJWT({ ...claims, kind: "oauth-pending" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(PENDING_TTL)
    .sign(key());
}

export async function verifyOauthPending(token: string): Promise<OauthPendingClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "oauth-pending") return null;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return payload as unknown as OauthPendingClaims;
  } catch {
    return null;
  }
}

/* ----------------------------- cookie utils ---------------------------- */

/** Parse a raw Cookie header — routes read state/pending without
 *  next/headers so they stay unit-testable with a plain Request. */
export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function shortLivedCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Lax: Google's redirect back to /callback is a top-level cross-site
    // GET — Strict would drop the state cookie there (same reason the
    // session cookie is Lax).
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Expire a cookie (value emptied, maxAge 0). */
export function clearedCookieOptions() {
  return { ...shortLivedCookieOptions(0), maxAge: 0 };
}
