import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { googleClientId, googleClientSecret } from "./oauth-google";

/**
 * Google OAuth — the NETWORK half. Isolated from oauth-google.ts so the
 * callback route's tests stub THIS module (exchangeCode +
 * verifyGoogleIdToken) while the CSRF-state crypto runs for real.
 *
 * We only ever need the id_token (identity proof). We do NOT request or
 * keep the access/refresh tokens — no Google API is called after
 * sign-in, so there is nothing to store or leak.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// Google's public signing keys. createRemoteJWKSet caches + rotates on
// its own; module-scope so we reuse one fetcher across requests.
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Authorization-code → id_token (PKCE verifier completes the exchange). */
export async function exchangeCode(opts: {
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<{ idToken: string }> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");

  const body = new URLSearchParams({
    code: opts.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
    code_verifier: opts.verifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`google token exchange failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("google token response missing id_token");
  return { idToken: json.id_token };
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

/**
 * Verify the id_token against Google's JWKS: RS256 signature, issuer,
 * audience (our client id), expiry, and the nonce we bound at /start.
 * Returns null on any failure — the callback treats null as auth-failed.
 */
export async function verifyGoogleIdToken(idToken: string, nonce: string): Promise<GoogleIdentity | null> {
  const clientId = googleClientId();
  if (!clientId) return null;
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
    });
    if (payload.nonce !== nonce) return null;
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email) return null;
    return {
      sub,
      email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : email.split("@")[0]!,
    };
  } catch {
    return null;
  }
}
