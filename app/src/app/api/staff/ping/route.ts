import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { rateLimitAsync } from "@/lib/rate-limit";
import { emit } from "@/lib/realtime";
import { sendPushToStaff } from "@/lib/fcm";
import {
  PING_VISIBLE_MS,
  STAFF_PING_KINDS,
  isStaffPingKind,
  pingSentence,
  recipientsFor,
  type StaffPingKind,
} from "@/lib/staff/ping";

/**
 * Staff asking each other for something.
 *
 * GET returns what is currently open, so a server opening their phone
 * mid-shift sees an ask raised two minutes ago rather than only ones
 * that arrive while they happen to be looking.
 *
 * POST raises one. No body field, by design — see lib/staff/ping.
 * PATCH answers one: "I've got this", which is the only response that
 * changes anything on a floor.
 *
 * Everything is scoped to the caller's own venue from the session. A
 * ping cannot be raised into, read from, or answered at another venue
 * however the request is shaped.
 */

export const dynamic = "force-dynamic";

// A ping buzzes other people's phones. Six a minute is generous for a
// bad rush and still stops one frustrated tap becoming forty.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const since = new Date(Date.now() - PING_VISIBLE_MS);
  const pings = await db.staffPing.findMany({
    where: {
      venueId: session.venueId,
      answeredAt: null,
      createdAt: { gte: since },
      // Either addressed to the whole floor, or to this person.
      OR: [{ toStaffId: null }, { toStaffId: session.staffId }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      kind: true,
      createdAt: true,
      fromStaffId: true,
      fromStaff: { select: { displayName: true, name: true } },
      table: { select: { label: true } },
    },
  });

  return NextResponse.json({
    pings: pings
      // A server shouldn't be shown their own ask as something to answer.
      .filter(p => p.fromStaffId !== session.staffId)
      .map(p => ({
        id: p.id,
        kind: p.kind,
        createdAt: p.createdAt.toISOString(),
        // Floor name only — this can land on a shared tablet.
        text: pingSentence({
          kind: p.kind as StaffPingKind,
          fromName: p.fromStaff.displayName ?? p.fromStaff.name.split(/\s+/)[0] ?? "Someone",
          tableLabel: p.table?.label ?? null,
        }),
      })),
  });
}

const CreateBody = z.object({
  kind: z.enum(STAFF_PING_KINDS as [StaffPingKind, ...StaffPingKind[]]),
  tableId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  if (!isStaffPingKind(parsed.kind)) {
    return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
  }

  const limit = await rateLimitAsync(`ping:${session.staffId}`, {
    windowMs: WINDOW_MS,
    max: MAX_PER_WINDOW,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "RATE_LIMITED", detail: "Give that a moment.", retryAfterMs: limit.retryAfterMs },
      { status: 429 },
    );
  }

  const [sender, table] = await Promise.all([
    db.staffMember.findUnique({
      where: { id: session.staffId },
      select: { id: true, displayName: true, name: true, status: true, venueId: true },
    }),
    parsed.tableId
      ? db.table.findUnique({
          where: { id: parsed.tableId },
          select: { id: true, label: true, venueId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!sender || sender.status !== "ACTIVE" || sender.venueId !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  // A table from another venue must not be attachable, however the id
  // was obtained.
  if (parsed.tableId && (!table || table.venueId !== session.venueId)) {
    return NextResponse.json({ error: "INVALID_TABLE" }, { status: 400 });
  }

  const created = await db.staffPing.create({
    data: {
      venueId: session.venueId,
      fromStaffId: sender.id,
      tableId: table?.id ?? null,
      kind: parsed.kind,
    },
    select: { id: true, createdAt: true },
  });

  const fromName = sender.displayName ?? sender.name.split(/\s+/)[0] ?? "Someone";
  const text = pingSentence({
    kind: parsed.kind,
    fromName,
    tableLabel: table?.label ?? null,
  });

  // Fire-and-forget: the row is the source of truth, and the GET above
  // catches anyone whose socket was down.
  void (async () => {
    try {
      const staff = await db.staffMember.findMany({
        where: { venueId: session.venueId, status: "ACTIVE" },
        select: { id: true, role: true, fcmToken: true },
      });
      const recipientIds = new Set(recipientsFor(parsed.kind, staff, sender.id));

      await emit({
        kind: "venue",
        id: session.venueId,
        event: "staff_ping",
        payload: {
          ping: { id: created.id, kind: parsed.kind, text, createdAt: created.createdAt.toISOString() },
          // The client filters on this rather than the server sending
          // per-staff events: one venue emit is cheaper than N, and the
          // payload carries nothing private.
          recipientIds: [...recipientIds],
        },
      });

      const tokens = staff
        .filter(s => recipientIds.has(s.id) && s.fcmToken)
        .map(s => s.fcmToken!)
        .filter(Boolean);
      if (tokens.length > 0) {
        await sendPushToStaff(tokens, { title: "TabCall", body: text, data: { pingId: created.id } });
      }
    } catch (err) {
      console.error("[staff-ping] fan-out failed:", err);
    }
  })();

  return NextResponse.json({ id: created.id, text }, { status: 201 });
}

const AnswerBody = z.object({ pingId: z.string().min(1) });

export async function PATCH(req: Request) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = AnswerBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // Compare-and-swap on answeredAt so two people tapping at once produce
  // one answer, and the second is told somebody already has it rather
  // than silently overwriting them.
  const result = await db.staffPing.updateMany({
    where: { id: parsed.pingId, venueId: session.venueId, answeredAt: null },
    data: { answeredAt: new Date(), answeredById: session.staffId },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "ALREADY_ANSWERED" }, { status: 409 });
  }

  void emit({
    kind: "venue",
    id: session.venueId,
    event: "staff_ping_answered",
    payload: { pingId: parsed.pingId },
  });

  return NextResponse.json({ ok: true });
}
