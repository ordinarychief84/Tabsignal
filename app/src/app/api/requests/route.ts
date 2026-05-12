import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitAsync } from "@/lib/rate-limit";
import { events } from "@/lib/realtime";
import { sendPushToStaff } from "@/lib/fcm";

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const Body = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  type: z.enum(["DRINK", "BILL", "HELP", "REFILL"]),
  note: z.string().max(120).optional(),
});

// PRD v2.0 F1: <= 1 request per 30s window per session.
const WINDOW_MS = 30_000;
const MAX_PER_WINDOW = 1;

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Verify ownership BEFORE bumping the rate-limit bucket. The bucket key
  // is `req:${sessionId}`; if we incremented before the token check, any
  // attacker who scraped a sessionId out of a guest URL could burn the
  // legitimate guest's bucket every 30s and deny them service. Now an
  // unauthenticated attacker only ever reaches the 403 branch.
  const session = await db.guestSession.findUnique({
    where: { id: parsed.sessionId },
    include: { venue: { select: { requireIdOnFirstDrink: true } } },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (!tokensEqual(session.sessionToken, parsed.sessionToken)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }
  if (session.paidAt) {
    return NextResponse.json({ error: "SESSION_CLOSED" }, { status: 410 });
  }

  // Token check passed — NOW consume the rate-limit bucket.
  const limit = await rateLimitAsync(`req:${parsed.sessionId}`, { windowMs: WINDOW_MS, max: MAX_PER_WINDOW });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  // Compliance: if the venue requires ID on first drink AND this is a
  // DRINK request AND no prior DRINK exists in this session, flag it.
  // Staff queue card surfaces a coral "ID check" badge before Got it.
  let idCheckRequired = false;
  if (parsed.type === "DRINK" && session.venue.requireIdOnFirstDrink) {
    const priorDrink = await db.request.findFirst({
      where: { sessionId: session.id, type: "DRINK" },
      select: { id: true },
    });
    if (!priorDrink) idCheckRequired = true;
  }

  const request = await db.request.create({
    data: {
      venueId: session.venueId,
      tableId: session.tableId,
      sessionId: session.id,
      type: parsed.type,
      note: parsed.note ?? null,
      idCheckRequired,
    },
    include: {
      table: {
        select: {
          label: true,
          assignments: { select: { staffMemberId: true } },
        },
      },
    },
  });

  const assignedStaffIds = request.table.assignments.map(a => a.staffMemberId);

  // Realtime push: venue room (everyone) + per-staff rooms for whoever covers
  // this table. Fire-and-forget — DB write is the source of truth.
  void events.newRequest(
    session.venueId,
    {
      id: request.id,
      type: request.type,
      note: request.note,
      status: request.status,
      tableId: request.tableId,
      tableLabel: request.table.label,
      sessionId: request.sessionId,
      createdAt: request.createdAt.toISOString(),
      idCheckRequired: request.idCheckRequired,
      assignedStaffIds,
    },
    assignedStaffIds
  );

  // Escalation runs on a 1-minute Vercel cron (api/cron/escalate). PRD F6's
  // "delayed at 90s, escalated at 3min" is implemented as a server-side flip
  // to status=ESCALATED with realtime fan-out — the staff queue already
  // shades cards client-side between 90s and the flip.

  // F2: FCM push to backgrounded staff PWAs. Realtime already fanned out
  // above — push is the safety net for when sockets disconnected. Wrap
  // the whole thing in try/catch + void so any FCM failure can't bubble
  // up and 500 the guest request (realtime is the source of truth).
  void (async () => {
    try {
      // Target ONLY assigned staff when this table has assignments;
      // otherwise blast every active staff at the venue. This mirrors
      // the realtime fan-out logic so push targets match the in-app
      // notifications staff already see.
      const whereStaff = assignedStaffIds.length > 0
        ? { id: { in: assignedStaffIds }, status: "ACTIVE" as const, fcmToken: { not: null } }
        : { venueId: session.venueId, status: "ACTIVE" as const, fcmToken: { not: null } };

      const recipients = await db.staffMember.findMany({
        where: whereStaff,
        select: { id: true, fcmToken: true },
      });
      const tokens = recipients.map(r => r.fcmToken).filter((t): t is string => !!t);
      if (tokens.length === 0) return;

      const { invalidTokens } = await sendPushToStaff(tokens, {
        title: `${request.type} · ${request.table.label}`,
        body: request.note ?? "Tap to view in the queue.",
        data: {
          requestId: request.id,
          type: request.type,
          tableLabel: request.table.label,
          sessionId: request.sessionId,
        },
      });

      // Prune dead tokens so subsequent pushes don't waste a slot on them.
      if (invalidTokens.length > 0) {
        await db.staffMember.updateMany({
          where: { fcmToken: { in: invalidTokens } },
          data: { fcmToken: null },
        });
      }
    } catch (err) {
      console.error("[requests] FCM push failed:", err);
    }
  })();

  return NextResponse.json({ id: request.id, status: request.status }, { status: 201 });
}
