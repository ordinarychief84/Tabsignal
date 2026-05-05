"use client";

import { io, type Socket } from "socket.io-client";

const URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

let singleton: Socket | null = null;

/**
 * Returns a singleton Socket.io client for this browser tab.
 *
 * Multiple components calling getSocket() share one connection. Disconnect
 * is handled by the browser when the tab closes — we don't tear down on
 * unmount because the next page render would just re-open it.
 */
export function getSocket(): Socket {
  if (singleton) return singleton;
  singleton = io(URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
  if (process.env.NODE_ENV !== "production") {
    singleton.on("connect", () => console.debug("[socket] connected", singleton?.id));
    singleton.on("disconnect", reason => console.debug("[socket] disconnected", reason));
    singleton.on("connect_error", err => console.warn("[socket] connect_error", err.message));
  }
  return singleton;
}

export type JoinArgs = { venueId?: string; guestSessionId?: string };

/**
 * Joins the appropriate room and returns a teardown function.
 * Calls 'leave' on cleanup so we don't leak rooms across page navigations.
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
