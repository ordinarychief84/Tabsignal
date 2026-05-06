/**
 * TabSignal realtime + internal-emit backend.
 *
 * Why this exists separately from the Next.js app:
 *   - Vercel/Next.js serverless can't hold a long-lived WebSocket connection.
 *   - Staff PWAs and guest browsers need <2s push delivery, not poll.
 *
 * Surface:
 *   GET  /healthz                  — liveness
 *   POST /internal/emit            — Next.js → here. Validates shared secret,
 *                                    then re-emits to a Socket.io room.
 *   ws   /                          — Socket.io. Clients present a signed
 *                                    socket-auth JWT (minted by Next.js)
 *                                    that scopes which rooms they can join.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { Server as IOServer, type Socket } from "socket.io";
import { jwtVerify } from "jose";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

if (!INTERNAL_API_SECRET) {
  console.warn(
    "[tabsignal-api] INTERNAL_API_SECRET is empty — /internal/emit will reject all requests. Set it in .env."
  );
}
if (!NEXTAUTH_SECRET) {
  console.warn(
    "[tabsignal-api] NEXTAUTH_SECRET is empty — Socket.io connections will be rejected. Set it in .env."
  );
}

const app = Fastify({ logger: { level: LOG_LEVEL } });

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: ALLOWED_ORIGINS, credentials: true });

// ---------- Socket.io ----------
const io = new IOServer(app.server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
  // Long-poll fallback for cellular / corporate networks where WS is blocked.
  transports: ["websocket", "polling"],
});

const VENUE_ROOM = (id: string) => `venue:${id}`;
const GUEST_ROOM = (id: string) => `guest:${id}`;
const STAFF_ROOM = (id: string) => `staff:${id}`;

/**
 * The socket-auth token is signed by Next.js with NEXTAUTH_SECRET and lists
 * exactly which rooms this browser tab is allowed to join. Short TTL (10
 * minutes); the client transparently re-fetches if rejected.
 */
type SocketAuthClaims = {
  kind: "socket";
  venueId?: string;        // staff PWA: their venue
  staffId?: string;        // staff PWA: their personal room
  guestSessionId?: string; // guest browser: only their session room
};

async function verifySocketAuth(token: unknown): Promise<SocketAuthClaims | null> {
  if (typeof token !== "string" || !NEXTAUTH_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(NEXTAUTH_SECRET));
    if (payload.kind !== "socket") return null;
    return payload as unknown as SocketAuthClaims;
  } catch {
    return null;
  }
}

io.use(async (socket, next) => {
  const token = (socket.handshake.auth?.token as unknown) ?? socket.handshake.query?.token;
  const claims = await verifySocketAuth(token);
  if (!claims) {
    return next(new Error("UNAUTHORIZED"));
  }
  (socket.data as { claims: SocketAuthClaims }).claims = claims;
  next();
});

const JoinPayload = z.object({
  venueId: z.string().min(1).optional(),
  guestSessionId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
});

io.on("connection", (socket: Socket) => {
  const claims = (socket.data as { claims: SocketAuthClaims }).claims;
  app.log.info({ socketId: socket.id, claims }, "socket connected");

  socket.on("join", (raw, ack?: (res: { ok: boolean; error?: string }) => void) => {
    const parsed = JoinPayload.safeParse(raw);
    if (!parsed.success) {
      ack?.({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const { venueId, guestSessionId, staffId } = parsed.data;
    if (!venueId && !guestSessionId && !staffId) {
      ack?.({ ok: false, error: "NEED_VENUE_OR_SESSION_OR_STAFF" });
      return;
    }
    // Authorization: the requested rooms MUST match the rooms the token grants.
    if (venueId && claims.venueId !== venueId) {
      ack?.({ ok: false, error: "FORBIDDEN_VENUE" });
      return;
    }
    if (staffId && claims.staffId !== staffId) {
      ack?.({ ok: false, error: "FORBIDDEN_STAFF" });
      return;
    }
    if (guestSessionId && claims.guestSessionId !== guestSessionId) {
      ack?.({ ok: false, error: "FORBIDDEN_GUEST" });
      return;
    }
    if (venueId) socket.join(VENUE_ROOM(venueId));
    if (guestSessionId) socket.join(GUEST_ROOM(guestSessionId));
    if (staffId) socket.join(STAFF_ROOM(staffId));
    ack?.({ ok: true });
  });

  socket.on("leave", (raw, ack?: (res: { ok: boolean }) => void) => {
    const parsed = JoinPayload.safeParse(raw);
    if (parsed.success) {
      const { venueId, guestSessionId, staffId } = parsed.data;
      if (venueId) socket.leave(VENUE_ROOM(venueId));
      if (guestSessionId) socket.leave(GUEST_ROOM(guestSessionId));
      if (staffId) socket.leave(STAFF_ROOM(staffId));
    }
    ack?.({ ok: true });
  });

  socket.on("disconnect", reason => {
    app.log.debug({ socketId: socket.id, reason }, "socket disconnected");
  });
});

// ---------- HTTP routes ----------
app.get("/healthz", async () => ({
  ok: true,
  uptimeSec: Math.round(process.uptime()),
  socketsConnected: io.sockets.sockets.size,
}));

const EmitBody = z.object({
  // Either room: "venue:abc" / "guest:xyz" / "staff:def", or roomKind + id.
  room: z.string().min(1).optional(),
  roomKind: z.enum(["venue", "guest", "staff"]).optional(),
  roomId: z.string().min(1).optional(),
  event: z.string().min(1),
  payload: z.unknown().optional(),
});

app.post("/internal/emit", async (req, reply) => {
  const provided = req.headers["x-internal-secret"];
  if (!INTERNAL_API_SECRET || provided !== INTERNAL_API_SECRET) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const parsed = EmitBody.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "INVALID_BODY", detail: parsed.error.flatten() });
  }
  const { room, roomKind, roomId, event, payload } = parsed.data;
  const target =
    room ??
    (roomKind === "venue" && roomId
      ? VENUE_ROOM(roomId)
      : roomKind === "guest" && roomId
      ? GUEST_ROOM(roomId)
      : roomKind === "staff" && roomId
      ? STAFF_ROOM(roomId)
      : null);
  if (!target) {
    return reply.code(400).send({ error: "NO_TARGET_ROOM" });
  }

  io.to(target).emit(event, payload ?? null);
  return { ok: true, room: target, event };
});

// ---------- start ----------
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(
    { port: PORT, allowedOrigins: ALLOWED_ORIGINS },
    "tabsignal-api listening"
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
