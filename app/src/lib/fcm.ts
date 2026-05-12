/**
 * Firebase Cloud Messaging (FCM) — server helper.
 *
 * Sends push notifications to backgrounded staff PWAs so they don't miss
 * new requests when the realtime socket disconnects (tab hidden, phone
 * locked, etc.). Realtime is still the primary path; FCM is the
 * "we couldn't reach you over the wire" fallback.
 *
 * Design choices:
 * - Lazy init. firebase-admin is heavy and many dev machines won't have
 *   Firebase creds configured. We defer initializeApp() to the first
 *   send and short-circuit (no-op + warn once) when creds are absent.
 * - Multi-token via sendEachForMulticast so a single bad token (logged-out
 *   staff member, uninstalled PWA) doesn't poison the whole batch.
 * - We bubble up invalidTokens so callers can prune their DB; FCM's two
 *   "this token is dead, stop using it" errors are
 *   `messaging/registration-token-not-registered` and
 *   `messaging/invalid-registration-token`.
 * - Vercel env vars store FIREBASE_PRIVATE_KEY with literal "\n" sequences
 *   (the dashboard escapes real newlines). We convert before passing to
 *   firebase-admin.
 */

// We deliberately import types from firebase-admin lazily inside functions
// — top-level import would force the dep to be installed even when nobody
// uses FCM. The types below are duplicated minimally to keep TS strict.
type Messaging = {
  sendEachForMulticast(message: {
    tokens: string[];
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
    android?: { priority?: "normal" | "high" };
    apns?: { headers?: Record<string, string> };
  }): Promise<{
    responses: Array<{
      success: boolean;
      messageId?: string;
      error?: { code?: string; message?: string };
    }>;
    successCount: number;
    failureCount: number;
  }>;
};

let warned = false;
let cachedMessaging: Messaging | null = null;
let initAttempted = false;

function readCreds(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !rawKey) return null;
  // Vercel-style env vars store "\n" as literal backslash-n. Convert to
  // real newlines so the PEM parses. (If the var already contains real
  // newlines — e.g. when pasted into .env.local with quotes — replace is
  // a no-op.)
  const privateKey = rawKey.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

async function getMessaging(): Promise<Messaging | null> {
  if (cachedMessaging) return cachedMessaging;
  if (initAttempted && !cachedMessaging) return null;
  initAttempted = true;

  const creds = readCreds();
  if (!creds) {
    if (!warned) {
      console.warn(
        "[fcm] FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY missing — push disabled.",
      );
      warned = true;
    }
    return null;
  }

  try {
    // Dynamic import so dev environments without firebase-admin still
    // type-check + run.
    const admin = await import("firebase-admin/app");
    const messagingMod = await import("firebase-admin/messaging");
    const apps = admin.getApps();
    const app = apps.length
      ? apps[0]
      : admin.initializeApp({
          credential: admin.cert({
            projectId: creds.projectId,
            clientEmail: creds.clientEmail,
            privateKey: creds.privateKey,
          }),
        });
    cachedMessaging = messagingMod.getMessaging(app) as unknown as Messaging;
    return cachedMessaging;
  } catch (err) {
    console.error("[fcm] firebase-admin init failed:", err);
    return null;
  }
}

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Set true for time-critical alerts (e.g. escalation). */
  highPriority?: boolean;
};

export type PushResult = {
  sent: number;
  invalidTokens: string[];
};

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  // Belt-and-suspenders: prefixed without namespace in some SDK versions.
  "registration-token-not-registered",
  "invalid-registration-token",
]);

/**
 * Push a notification to a set of FCM tokens. Returns the count
 * delivered and an array of tokens FCM said are dead (so the caller
 * can null them out in StaffMember.fcmToken).
 *
 * Never throws — returns `{ sent: 0, invalidTokens: [] }` when creds
 * are absent or the SDK init fails. Push is best-effort.
 */
export async function sendPushToStaff(
  tokens: string[],
  notification: PushPayload,
): Promise<PushResult> {
  if (tokens.length === 0) return { sent: 0, invalidTokens: [] };

  const messaging = await getMessaging();
  if (!messaging) return { sent: 0, invalidTokens: [] };

  // Dedupe — a staff member with two devices would have one row per
  // device once we support that, but today fcmToken is single-string.
  const unique = Array.from(new Set(tokens));

  try {
    const message: Parameters<Messaging["sendEachForMulticast"]>[0] = {
      tokens: unique,
      notification: { title: notification.title, body: notification.body },
      data: notification.data,
    };
    if (notification.highPriority) {
      message.android = { priority: "high" };
      message.apns = { headers: { "apns-priority": "10" } };
    }

    const response = await messaging.sendEachForMulticast(message);

    const invalidTokens: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code;
        if (code && INVALID_TOKEN_CODES.has(code)) {
          invalidTokens.push(unique[i]);
        }
      }
    });

    return { sent: response.successCount, invalidTokens };
  } catch (err) {
    console.error("[fcm] sendEachForMulticast failed:", err);
    return { sent: 0, invalidTokens: [] };
  }
}

/** Test-only: reset the module cache so unit tests can re-init. */
export function _resetFcmForTest(): void {
  cachedMessaging = null;
  initAttempted = false;
  warned = false;
}
