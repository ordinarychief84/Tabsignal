/* eslint-disable no-undef */
// firebase-messaging-sw.js — handles backgrounded notifications.
//
// Web config is read from the registration URL's `?...params=` so it's
// not hardcoded; the client passes the public Firebase web config at
// register() time, which means the same file works across dev / preview /
// prod without a build step. None of the values here are secret — the
// Firebase web SDK explicitly publishes them.
//
// Loaded via Firebase compat SDK from gstatic so we don't pay a build
// cost for the worker. compat keeps the global `firebase.*` API the
// older messaging samples use; the modular SDK doesn't ship a worker
// build today.

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

// Parse config from the SW registration URL: ?apiKey=...&authDomain=...
const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey") || "",
  authDomain: params.get("authDomain") || "",
  projectId: params.get("projectId") || "",
  messagingSenderId: params.get("messagingSenderId") || "",
  appId: params.get("appId") || "",
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || "TabCall";
    const body = (payload.notification && payload.notification.body) || "";
    const data = payload.data || {};
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.requestId || undefined,
      data,
    });
  });
}

// Clicking the notification focuses an existing staff tab or opens one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes("/staff") && "focus" in client) {
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow("/staff");
    }
  })());
});
