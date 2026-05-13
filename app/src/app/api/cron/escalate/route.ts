import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { events, emit } from "@/lib/realtime";
import { sendPushToStaff } from "@/lib/fcm";

/**
 * Vercel Cron handler — request escalation.
 *
 * Scans for PENDING requests older than the escalation threshold and
 * flips them to ESCALATED, emitting a realtime event so the staff queue
 * paints the card coral. Runs every minute via vercel.json.
 *
 * Auth: same bearer-token model as /api/cron/benchmarks — Vercel sets
 * the Authorization header on cron deliveries to the value of
 * BENCHMARK_CRON_SECRET (we reuse the same secret rather than minting
 * a second one; cron endpoints share a single trust boundary).
 *
 * PRD F6: "delayed" is 90s; "escalated" is 3min. We use 180s (3min) as
 * the server-side flip threshold — the staff queue already shades cards
 * orange between 90s and 180s purely client-side, so escalation is the
 * harder, more visible state.
 *
 * Idempotent by construction: we update rows WHERE status='PENDING' AND
 * age >= threshold AND escalatedAt IS NULL. Re-running picks up new
 * rows but doesn't re-emit for already-escalated ones.
 */
export const dynamic = "force-dynamic";

const ESCALATION_AGE_MS = 3 * 60_000; // 3 minutes

export async function GET(req: Request) {
  const expected = process.env.BENCHMARK_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - ESCALATION_AGE_MS);

  // Find candidates first so we can fire realtime events per row. Cap at
  // 200/run so a backlog can't blow the cron's serverless time budget;
  // the next minute's run will pick up the remainder.
  const candidates = await db.request.findMany({
    where: {
      status: "PENDING",
      createdAt: { lte: cutoff },
      escalatedAt: null,
    },
    take: 200,
    select: {
      id: true,
      venueId: true,
      sessionId: true,
      tableId: true,
      type: true,
      createdAt: true,
      table: {
        select: {
          label: true,
          assignments: { select: { staffMemberId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, escalated: 0 });
  }

  const ids = candidates.map(c => c.id);
  const now = new Date();
  const updated = await db.request.updateMany({
    where: { id: { in: ids }, status: "PENDING", escalatedAt: null },
    data: { status: "ESCALATED", escalatedAt: now },
  });

  // Fire realtime nudges + a coral-toned notification to the venue room.
  // We loop sequentially with `emit` (not `events.*`) to fan out a single
  // "request_escalated" event the staff queue can subscribe to. Failures
  // are best-effort; the DB write is the source of truth.
  for (const c of candidates) {
    void emit({
      kind: "venue",
      id: c.venueId,
      event: "request_escalated",
      payload: {
        id: c.id,
        type: c.type,
        tableId: c.tableId,
        tableLabel: c.table.label,
        sessionId: c.sessionId,
        createdAt: c.createdAt.toISOString(),
        escalatedAt: now.toISOString(),
        ageSeconds: Math.round((now.getTime() - c.createdAt.getTime()) / 1000),
      },
    });
    // Nudge the guest browser too so the post-request banner can change
    // wording ("we're still trying to reach a server"). Reuses the
    // existing requestAcknowledged event channel structure.
    void events.requestAcknowledged(c.venueId, c.sessionId, {
      id: c.id,
      status: "ESCALATED",
      type: c.type,
      tableLabel: c.table.label,
    });
  }

  // FCM push for each escalated request — high priority so iOS lifts
  // the notification past Focus mode. Same target rules as /api/requests:
  // assigned staff if any, else all active staff at the venue. Best
  // effort; failures get logged but don't fail the cron run.
  void (async () => {
    for (const c of candidates) {
      try {
        const assignedStaffIds = c.table.assignments.map(a => a.staffMemberId);
        const whereStaff = assignedStaffIds.length > 0
          ? { id: { in: assignedStaffIds }, status: "ACTIVE" as const, fcmToken: { not: null } }
          : { venueId: c.venueId, status: "ACTIVE" as const, fcmToken: { not: null } };

        const recipients = await db.staffMember.findMany({
          where: whereStaff,
          select: { fcmToken: true },
        });
        const tokens = recipients.map(r => r.fcmToken).filter((t): t is string => !!t);
        if (tokens.length === 0) continue;

        const { invalidTokens } = await sendPushToStaff(tokens, {
          title: `${c.type} · ${c.table.label}`,
          body: "Delayed. Please respond now.",
          data: {
            requestId: c.id,
            type: c.type,
            tableLabel: c.table.label,
            sessionId: c.sessionId,
            status: "ESCALATED",
          },
          highPriority: true,
        });
        if (invalidTokens.length > 0) {
          await db.staffMember.updateMany({
            where: { fcmToken: { in: invalidTokens } },
            data: { fcmToken: null },
          });
        }
      } catch (err) {
        console.error("[escalate] FCM push failed for request", c.id, err);
      }
    }
  })();

  return NextResponse.json({
    ok: true,
    escalated: updated.count,
    cutoff: cutoff.toISOString(),
  });
}
