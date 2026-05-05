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
 *   ws   /                          — Socket.io. Clients join venue:{id} or
 *                                    guest:{sessionId} rooms.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { Server as IOServer } from "socket.io";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 4000);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

if (!INTERNAL_API_SECRET) {
  console.warn(
    "[tabsignal-api] INTERNAL_API_SECRET is empty — /internal/emit will reject all requests. Set it in .env."
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

const JoinPayload = z.object({
  venueId: z.string().min(1).optional(),
  guestSessionId: z.string().min(1).optional(),
});

io.on("connection", socket => {
  app.log.info({ socketId: socket.id }, "socket connected");

  socket.on("join", (raw, ack?: (res: { ok: boolean; error?: string }) => void) => {
    const parsed = JoinPayload.safeParse(raw);
    if (!parsed.success) {
      ack?.({ ok: false, error: "INVALID_PAYLOAD" });
      return;
    }
    const { venueId, guestSessionId } = parsed.data;
    if (!venueId && !guestSessionId) {
      ack?.({ ok: false, error: "NEED_VENUE_OR_SESSION" });
      return;
    }
    if (venueId) socket.join(VENUE_ROOM(venueId));
    if (guestSessionId) socket.join(GUEST_ROOM(guestSessionId));
    ack?.({ ok: true });
  });

  socket.on("leave", (raw, ack?: (res: { ok: boolean }) => void) => {
    const parsed = JoinPayload.safeParse(raw);
    if (parsed.success) {
      const { venueId, guestSessionId } = parsed.data;
      if (venueId) socket.leave(VENUE_ROOM(venueId));
      if (guestSessionId) socket.leave(GUEST_ROOM(guestSessionId));
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
  // Either room: "venue:abc" / "guest:xyz", or roomKind + id.
  room: z.string().min(1).optional(),
  roomKind: z.enum(["venue", "guest"]).optional(),
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
