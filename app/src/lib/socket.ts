"use client";

import { io, type Socket } from "socket.io-client";

const URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

type SocketTokenFetcher = () => Promise<string | null>;

let singleton: Socket | null = null;
let tokenFetcher: SocketTokenFetcher = defaultFetcher;

async function defaultFetcher(): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime/token", { method: "POST" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.token === "string" ? body.token : null;
  } catch {
    return null;
  }
}

/**
 * Override the default fetcher (e.g. to pass a guest session token).
 * Call this once on guest pages before any getSocket()/joinRoom() use.
 */
export function configureSocketAuth(fetcher: SocketTokenFetcher) {
  tokenFetcher = fetcher;
}

/**
 * Returns a singleton Socket.io client for this browser tab.
 * Authenticates by fetching a short-lived JWT from /api/realtime/token.
 */
export function getSocket(): Socket {
  if (singleton) return singleton;
  let cachedToken: string | null = null;

  singleton = io(URL, {
    transports: ["websocket", "polling"],
    autoConnect: false,                              // wait until we have a token
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    auth: async cb => {
      // Re-mint on every (re)connect attempt so expired tokens self-heal.
      cachedToken = await tokenFetcher();
      cb({ token: cachedToken ?? "" });
    },
  });

  // Manually trigger first connect after wiring listeners.
  setTimeout(() => singleton?.connect(), 0);

  if (process.env.NODE_ENV !== "production") {
    singleton.on("connect", () => console.debug("[socket] connected", singleton?.id));
    singleton.on("disconnect", reason => console.debug("[socket] disconnected", reason));
    singleton.on("connect_error", err => console.warn("[socket] connect_error", err.message));
  }
  return singleton;
}

export type JoinArgs = { venueId?: string; guestSessionId?: string; staffId?: string };

/**
 * Joins the appropriate room and returns a teardown function.
 */
export function joinRoom(args: JoinArgs): () => void {
  const s = getSocket();
  const send = () => s.emit("join", args);
  if (s.connected) send();
  else s.once("connect", send);
  return () => {
    s.emit("leave", args);
  };
}
