import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { encryptCredentials, decryptCredentials } from "@/lib/pos/crypto";
import { googleClientId, googleClientSecret, oauthGoogleEnabled } from "@/lib/auth/oauth-google";

/**
 * domain/reviews/gbp — Google Business Profile connection + review sync
 * (reviews suite R3).
 *
 * SHIPS DORMANT. Two gates must open before any of this runs for real:
 *   1. GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in env (same Cloud
 *      client as sign-in OAuth — one console setup for both).
 *   2. Google's Business Profile API access approval for that Cloud
 *      project (Google gates these APIs behind an application form).
 * Until then every route answers 503 GBP_NOT_CONFIGURED and no UI
 * breaks. Same ships-dormant pattern as sign-in OAuth and Stripe.
 *
 * Security posture:
 *   - The venue-level refresh token is AES-256-GCM encrypted at rest
 *     via lib/pos/crypto (NEXTAUTH_SECRET-derived key). It is decrypted
 *     only here, per call, server-only.
 *   - The connect flow binds venue+staff through a signed state JWT
 *     (kind:"gbp") — ONE registered redirect URI (/api/gbp/callback)
 *     serves every venue; the state carries the tenant, not the URL.
 *   - access_type=offline + prompt=consent forces Google to issue a
 *     refresh token on every (re)connect.
 */

const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const LOCATIONS_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
// Reviews still live on the v4 surface — Google never migrated them.
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export function gbpEnabled(): boolean {
  return oauthGoogleEnabled();
}

export function gbpRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/gbp/callback`;
}

/* ------------------------------ state JWT ------------------------------ */

export type GbpStateClaims = {
  kind: "gbp";
  venueId: string;
  slug: string;
  staffId: string;
};

function key(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signGbpState(claims: Omit<GbpStateClaims, "kind">): Promise<string> {
  return new SignJWT({ ...claims, kind: "gbp" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key());
}

export async function verifyGbpState(token: string): Promise<GbpStateClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.kind !== "gbp") return null;
    if (
      typeof payload.venueId !== "string" ||
      typeof payload.slug !== "string" ||
      typeof payload.staffId !== "string"
    ) {
      return null;
    }
    return payload as unknown as GbpStateClaims;
  } catch {
    return null;
  }
}

/* ------------------------------ OAuth dance ---------------------------- */

export function gbpConnectUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: googleClientId() ?? "",
    redirect_uri: gbpRedirectUri(origin),
    response_type: "code",
    scope: `${GBP_SCOPE} email`,
    access_type: "offline",
    // Force a refresh token even on re-consent — without this Google
    // only issues one on the FIRST grant and reconnects silently break.
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type GbpTokens = {
  accessToken: string;
  refreshToken: string;
  /** Google account email, when the id_token carried one. */
  email: string | null;
};

export async function exchangeGbpCode(origin: string, code: string): Promise<GbpTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId() ?? "",
      client_secret: googleClientSecret() ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: gbpRedirectUri(origin),
    }),
  });
  if (!res.ok) throw new Error(`gbp token endpoint ${res.status}`);
  const body = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
  };
  if (!body.access_token) throw new Error("gbp: no access_token in response");
  if (!body.refresh_token) {
    // prompt=consent should prevent this; surface loudly if it happens.
    throw new Error("gbp: Google returned no refresh_token — re-run consent");
  }
  // Email from the id_token payload (unverified parse is fine here — the
  // token came directly from Google over TLS; it's display metadata).
  let email: string | null = null;
  if (body.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(body.id_token.split(".")[1] ?? "", "base64url").toString("utf8"),
      ) as { email?: string };
      email = payload.email ?? null;
    } catch { /* display-only */ }
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token, email };
}

export async function gbpAccessToken(encryptedRefreshToken: string): Promise<string> {
  const refreshToken = decryptCredentials(encryptedRefreshToken);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId() ?? "",
      client_secret: googleClientSecret() ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`gbp refresh ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("gbp: refresh returned no access_token");
  return body.access_token;
}

export function encryptRefreshToken(refreshToken: string): string {
  return encryptCredentials(refreshToken);
}

/* ------------------------------ GBP API -------------------------------- */

async function gbpGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`gbp api ${res.status} for ${new URL(url).pathname}`);
  return (await res.json()) as T;
}

export type GbpAccount = { name: string; accountName?: string; type?: string };
export type GbpLocation = { name: string; title?: string };

export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const body = await gbpGet<{ accounts?: GbpAccount[] }>(accessToken, `${ACCOUNTS_API}/accounts`);
  return body.accounts ?? [];
}

export async function listGbpLocations(
  accessToken: string,
  accountName: string,
): Promise<GbpLocation[]> {
  const p = new URLSearchParams({ readMask: "name,title", pageSize: "100" });
  const body = await gbpGet<{ locations?: GbpLocation[] }>(
    accessToken,
    `${LOCATIONS_API}/${accountName}/locations?${p.toString()}`,
  );
  return body.locations ?? [];
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export type GbpReview = {
  name: string; // accounts/x/locations/y/reviews/z
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string };
  reviewReply?: { comment?: string; updateTime?: string };
};

export async function listGbpReviews(
  accessToken: string,
  accountName: string,
  locationName: string,
  pageToken?: string,
): Promise<{ reviews: GbpReview[]; nextPageToken: string | null }> {
  const p = new URLSearchParams({ pageSize: "50" });
  if (pageToken) p.set("pageToken", pageToken);
  const body = await gbpGet<{ reviews?: GbpReview[]; nextPageToken?: string }>(
    accessToken,
    `${REVIEWS_API}/${accountName}/${locationName}/reviews?${p.toString()}`,
  );
  return { reviews: body.reviews ?? [], nextPageToken: body.nextPageToken ?? null };
}

/** PUT the owner's reply onto a review (R4 uses this). */
export async function putGbpReply(
  accessToken: string,
  reviewName: string,
  comment: string,
): Promise<void> {
  const res = await fetch(`${REVIEWS_API}/${reviewName}/reply`, {
    method: "PUT",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) throw new Error(`gbp reply ${res.status}`);
}

/* -------------------------------- sync --------------------------------- */

const MAX_PAGES_PER_SYNC = 5; // 250 reviews/run — plenty per cron tick

/**
 * Pull the venue's Google reviews into the local mirror. Idempotent
 * (upsert on gbpReviewName); never throws — failures land on
 * GbpConnection.lastError/status so the settings card can show them.
 */
export async function syncVenueReviews(venueId: string): Promise<{ synced: number } | { error: string }> {
  const conn = await db.gbpConnection.findUnique({ where: { venueId } });
  if (!conn || conn.status === "DISCONNECTED" || !conn.encryptedRefreshToken) {
    return { error: "NOT_CONNECTED" };
  }
  if (!conn.gbpAccountName || !conn.gbpLocationName) return { error: "NO_LOCATION_BOUND" };

  try {
    const accessToken = await gbpAccessToken(conn.encryptedRefreshToken);
    let pageToken: string | undefined;
    let synced = 0;

    for (let page = 0; page < MAX_PAGES_PER_SYNC; page += 1) {
      const { reviews, nextPageToken } = await listGbpReviews(
        accessToken,
        conn.gbpAccountName,
        conn.gbpLocationName,
        pageToken,
      );
      for (const r of reviews) {
        const starRating = STAR_MAP[r.starRating ?? ""] ?? 0;
        if (!r.name || starRating === 0) continue;
        const existingReply = r.reviewReply?.comment ?? null;
        await db.googleReview.upsert({
          where: { gbpReviewName: r.name },
          create: {
            venueId,
            gbpReviewName: r.name,
            starRating,
            comment: r.comment ?? null,
            reviewerName: r.reviewer?.displayName ?? null,
            reviewerPhotoUrl: r.reviewer?.profilePhotoUrl ?? null,
            gbpCreatedAt: r.createTime ? new Date(r.createTime) : new Date(),
            gbpUpdatedAt: r.updateTime ? new Date(r.updateTime) : null,
            replyText: existingReply,
            repliedAt: existingReply && r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
            replySource: existingReply ? "gbp" : null,
          },
          update: {
            starRating,
            comment: r.comment ?? null,
            reviewerName: r.reviewer?.displayName ?? null,
            reviewerPhotoUrl: r.reviewer?.profilePhotoUrl ?? null,
            gbpUpdatedAt: r.updateTime ? new Date(r.updateTime) : null,
            // A reply that appeared on GBP (posted there directly) wins
            // over our local null; a TabCall-posted reply is already in
            // both places so this is a no-op for it.
            ...(existingReply
              ? {
                  replyText: existingReply,
                  repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : new Date(),
                  replySource: "gbp",
                }
              : {}),
            syncedAt: new Date(),
          },
        });
        synced += 1;
      }
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }

    await db.gbpConnection.update({
      where: { venueId },
      data: { lastSyncAt: new Date(), lastError: null, status: "CONNECTED" },
    });
    return { synced };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.gbpConnection
      .update({ where: { venueId }, data: { lastError: message, status: "ERROR" } })
      .catch(() => { /* status write is best-effort */ });
    return { error: message };
  }
}
