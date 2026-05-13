"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * FCM registration UI.
 *
 * - Renders nothing when the public Firebase config is absent (dev
 *   without an FCM project) or when the browser doesn't support
 *   Notifications / ServiceWorker.
 * - Renders a small "Enable alerts" chartreuse pill when
 *   Notification.permission === "default".
 * - Silently refreshes the token when permission is already granted
 *   and either no token is cached locally or the cached token is older
 *   than 7 days (Firebase rotates tokens — re-registering keeps the
 *   DB row fresh).
 *
 * The web config values here are public — the Firebase web SDK
 * publishes them. The only secret in this whole flow is the FCM
 * service-account credential which lives on the server.
 */

const LS_REGISTERED_AT = "__fcm_registered_at";
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Permission = "default" | "granted" | "denied" | "unsupported";

function readPermission(): Permission {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission as Permission;
}

export function FcmRegister() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  const configured = Boolean(apiKey && authDomain && projectId && messagingSenderId && appId && vapidKey);

  const [perm, setPerm] = useState<Permission>("unsupported");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setPerm(readPermission());
  }, []);

  const register = useCallback(async () => {
    if (!configured) return;
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return;

    setBusy(true);
    try {
      // Step 1: request permission (no-op if already granted).
      let permission: NotificationPermission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
        setPerm(permission as Permission);
      }
      if (permission !== "granted") return;

      // Step 2: register the SW. We pass the public web config as URL
      // params so the SW file itself is config-free.
      const swParams = new URLSearchParams({
        apiKey: apiKey!,
        authDomain: authDomain!,
        projectId: projectId!,
        messagingSenderId: messagingSenderId!,
        appId: appId!,
      });
      const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?${swParams.toString()}`,
      );

      // Step 3: dynamically import the Firebase web SDK and mint a token.
      // Dynamic import keeps it out of the main bundle for users who
      // never enable alerts.
      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging, getToken } = await import("firebase/messaging");
      const app = getApps().length
        ? getApps()[0]
        : initializeApp({
            apiKey: apiKey!,
            authDomain: authDomain!,
            projectId: projectId!,
            messagingSenderId: messagingSenderId!,
            appId: appId!,
          });
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: vapidKey!,
        serviceWorkerRegistration: registration,
      });
      if (!token) return;

      // Step 4: POST the token to our API so the server can target it.
      const res = await fetch("/api/staff/fcm-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      });
      if (res.ok) {
        localStorage.setItem(LS_REGISTERED_AT, String(Date.now()));
        setHidden(true);
      }
    } catch (err) {
      // Silent — push is non-essential, don't disrupt the queue UI.
      console.warn("[fcm-register] failed:", err);
    } finally {
      setBusy(false);
    }
  }, [apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey, configured]);

  // Auto-refresh path: permission already granted, token cache stale.
  useEffect(() => {
    if (!configured) return;
    if (perm !== "granted") return;
    const last = Number(localStorage.getItem(LS_REGISTERED_AT) ?? 0);
    if (Date.now() - last < REFRESH_INTERVAL_MS) return;
    void register();
  }, [perm, configured, register]);

  if (!configured) return null;
  if (perm === "unsupported" || perm === "denied") return null;
  if (perm === "granted") return null; // either already done or refreshing in background
  if (hidden) return null;

  return (
    <div className="mx-auto max-w-md px-4 pt-3">
      <button
        type="button"
        onClick={() => void register()}
        disabled={busy}
        className="flex w-full items-center justify-between rounded-2xl border border-chartreuse/40 bg-chartreuse/10 px-4 py-2.5 text-left text-sm text-slate transition hover:bg-chartreuse/15 disabled:opacity-60"
      >
        <span>
          <span className="block text-[11px] uppercase tracking-[0.18em] text-umber">Stay reachable</span>
          <span className="block text-slate">Enable alerts when the app is closed</span>
        </span>
        <span className="rounded-full bg-chartreuse px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate">
          {busy ? "Enabling…" : "Enable"}
        </span>
      </button>
    </div>
  );
}

export default FcmRegister;
