import { NextResponse } from "next/server";
import { originFromRequest } from "@/lib/auth/redirect";
import { rateLimitAsync } from "@/lib/rate-limit";
import {
  oauthGoogleEnabled,
  googleRedirectUri,
  generatePkce,
  randomToken,
  buildGoogleAuthUrl,
  signOauthState,
  OAUTH_STATE_COOKIE,
  shortLivedCookieOptions,
} from "@/lib/auth/oauth-google";

/**
 * GET /api/auth/google/start — begin the Authorization Code + PKCE flow.
 * Signs a state cookie (CSRF + nonce + PKCE verifier + next + intent),
 * then 302s to Google. 503 when the feature isn't configured, so the
 * UI can hide the button and direct callers get a clean signal.
 */
export async function GET(req: Request) {
  if (!oauthGoogleEnabled()) {
    return NextResponse.json({ error: "OAUTH_NOT_CONFIGURED" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const gate = await rateLimitAsync(`oauth:start:ip:${ip}`, { windowMs: 60 * 60_000, max: 20 });
  if (!gate.ok) {
    return NextResponse.json({ error: "RATE_LIMITED", retryAfterMs: gate.retryAfterMs }, { status: 429 });
  }

  const url = new URL(req.url);
  const origin = originFromRequest(req);
  const { verifier, challenge } = generatePkce();
  const state = randomToken();
  const nonce = randomToken();

  const stateToken = await signOauthState({
    state,
    nonce,
    verifier,
    next: url.searchParams.get("next") ?? undefined,
    intent: url.searchParams.get("intent") ?? undefined,
  });

  const authorizeUrl = buildGoogleAuthUrl({
    redirectUri: googleRedirectUri(origin),
    state,
    nonce,
    codeChallenge: challenge,
  });

  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set(OAUTH_STATE_COOKIE, stateToken, shortLivedCookieOptions(600));
  return res;
}
