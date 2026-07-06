import type { Prisma, Request as GuestRequest } from "@prisma/client";
import { db } from "@/lib/db";
import { events, emit } from "@/lib/realtime";

/**
 * domain/requests/lifecycle — the request state machine, shared by the
 * owner console (/api/requests/[id]/*) and the smartwatch surface
 * (/api/wear/requests/[id]/*), which previously carried two verbatim
 * copies of this logic.
 *
 * Invariants (Phase 1 extraction — ported exactly, pinned by
 * request-lifecycle-flow.test.ts and wear-flow.test.ts unmodified):
 *   - ACK is first-acker-wins: compare-and-swap on
 *     (acknowledgedById IS NULL AND status = PENDING); losers get the
 *     current acker back, never an error.
 *   - RESOLVE is idempotent and requires an action; the CAS on
 *     status != RESOLVED means a second tap can't overwrite resolvedAt.
 *   - HANDOFF swaps the acker only — acknowledgedAt (SLA clock) is
 *     preserved.
 *   - Realtime emits fire ONLY on fresh transitions and carry the same
 *     payloads both surfaces always sent.
 */

export type Actor = { staffId: string; venueId: string };

export type ResolutionAction =
  | "SERVED" | "COMPED" | "REFUSED" | "ESCALATED" | "NOT_ACTIONABLE" | "OTHER";

type AckedRequest = GuestRequest & {
  table: { label: string };
  acknowledgedBy: { id: string; name: string } | null;
};

/* -------------------------------- ack ---------------------------------- */

export type AckResult =
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" | "ALREADY_RESOLVED" }
  | {
      ok: true;
      alreadyAcked: boolean;
      request: {
        id: string | undefined;
        status: GuestRequest["status"] | undefined;
        acknowledgedAt: string | null;
        acknowledgedById: string | null;
        ackedByName: string | null;
      };
    };

export async function acknowledgeRequest(actor: Actor, requestId: string): Promise<AckResult> {
  const existing = await db.request.findUnique({ where: { id: requestId } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };
  if (existing.venueId !== actor.venueId) return { ok: false, error: "FORBIDDEN" };
  if (existing.status === "RESOLVED") return { ok: false, error: "ALREADY_RESOLVED" };

  // First-acker wins. Compare-and-swap via updateMany — only updates if
  // no one else has claimed it AND the request is still PENDING. The
  // status filter prevents regressing a request that another staff
  // resolved-without-ack between our read and our write.
  const cas = await db.request.updateMany({
    where: { id: existing.id, acknowledgedById: null, status: "PENDING" },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedById: actor.staffId,
    },
  });

  if (cas.count === 0) {
    const cur = await db.request.findUnique({
      where: { id: existing.id },
      include: { acknowledgedBy: { select: { name: true } } },
    });
    return {
      ok: true,
      alreadyAcked: true,
      request: {
        id: cur?.id,
        status: cur?.status,
        acknowledgedAt: cur?.acknowledgedAt?.toISOString() ?? null,
        acknowledgedById: cur?.acknowledgedById ?? null,
        ackedByName: cur?.acknowledgedBy?.name ?? null,
      },
    };
  }

  const updated = (await db.request.findUnique({
    where: { id: existing.id },
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
  })) as AckedRequest | null;
  if (!updated) return { ok: false, error: "NOT_FOUND" };

  void events.requestAcknowledged(updated.venueId, updated.sessionId, {
    id: updated.id,
    status: updated.status,
    acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: updated.acknowledgedById,
    tableLabel: updated.table.label,
    type: updated.type,
    acknowledgedBy: updated.acknowledgedBy ? { name: updated.acknowledgedBy.name } : null,
  });

  return {
    ok: true,
    alreadyAcked: false,
    request: {
      id: updated.id,
      status: updated.status,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
      acknowledgedById: updated.acknowledgedById,
      ackedByName: updated.acknowledgedBy?.name ?? null,
    },
  };
}

/* ------------------------------- resolve ------------------------------- */

export type ResolveResult =
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" }
  | {
      ok: true;
      alreadyResolved: boolean;
      request: {
        id: string | undefined;
        status: GuestRequest["status"] | undefined;
        resolvedAt: string | null;
        resolutionAction: GuestRequest["resolutionAction"] | undefined;
      };
    };

export async function resolveRequest(
  actor: Actor,
  requestId: string,
  action: ResolutionAction,
  note?: string,
): Promise<ResolveResult> {
  const existing = await db.request.findUnique({ where: { id: requestId } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };
  if (existing.venueId !== actor.venueId) return { ok: false, error: "FORBIDDEN" };

  // Idempotent resolve: if already RESOLVED, return the original stamp
  // and skip the realtime emit.
  if (existing.status === "RESOLVED") {
    return {
      ok: true,
      alreadyResolved: true,
      request: {
        id: existing.id,
        status: existing.status,
        resolvedAt: existing.resolvedAt?.toISOString() ?? null,
        resolutionAction: existing.resolutionAction,
      },
    };
  }

  const data: Prisma.RequestUpdateManyMutationInput = {
    status: "RESOLVED",
    resolvedAt: new Date(),
    resolutionAction: action,
    resolutionNote: note ?? null,
  };
  const cas = await db.request.updateMany({
    where: { id: existing.id, status: { not: "RESOLVED" } },
    data,
  });

  if (cas.count === 0) {
    const cur = await db.request.findUnique({ where: { id: existing.id } });
    return {
      ok: true,
      alreadyResolved: true,
      request: {
        id: cur?.id,
        status: cur?.status,
        resolvedAt: cur?.resolvedAt?.toISOString() ?? null,
        resolutionAction: cur?.resolutionAction,
      },
    };
  }

  const updated = await db.request.findUnique({ where: { id: existing.id } });
  if (!updated) return { ok: false, error: "NOT_FOUND" };

  void events.requestResolved(updated.venueId, {
    id: updated.id,
    status: updated.status,
    resolvedAt: updated.resolvedAt?.toISOString() ?? null,
    resolutionAction: updated.resolutionAction,
  });

  return {
    ok: true,
    alreadyResolved: false,
    request: {
      id: updated.id,
      status: updated.status,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      resolutionAction: updated.resolutionAction,
    },
  };
}

/* ------------------------------- handoff ------------------------------- */

export type HandoffResult =
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN" | "NOT_ACKNOWLEDGED" | "INVALID_STAFF" }
  | {
      ok: true;
      noChange: boolean;
      request: { id: string; status: GuestRequest["status"]; acknowledgedById: string | null };
    };

export async function handoffRequest(
  actor: Actor,
  requestId: string,
  toStaffId: string,
): Promise<HandoffResult> {
  const existing = await db.request.findUnique({ where: { id: requestId } });
  if (!existing) return { ok: false, error: "NOT_FOUND" };
  if (existing.venueId !== actor.venueId) return { ok: false, error: "FORBIDDEN" };
  if (existing.status !== "ACKNOWLEDGED") return { ok: false, error: "NOT_ACKNOWLEDGED" };

  const dest = await db.staffMember.findUnique({ where: { id: toStaffId } });
  if (!dest || dest.venueId !== actor.venueId) return { ok: false, error: "INVALID_STAFF" };
  if (dest.id === existing.acknowledgedById) {
    return {
      ok: true,
      noChange: true,
      request: { id: existing.id, status: existing.status, acknowledgedById: dest.id },
    };
  }

  const updated = (await db.request.update({
    where: { id: existing.id },
    data: { acknowledgedById: dest.id },
    include: {
      table: { select: { label: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
  })) as AckedRequest;

  // Notify the venue (queue UIs reconcile name) AND the receiver's
  // personal staff room (so they see a "handed off to you" toast).
  void events.requestAcknowledged(updated.venueId, updated.sessionId, {
    id: updated.id,
    status: updated.status,
    acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    acknowledgedById: updated.acknowledgedById,
    acknowledgedBy: updated.acknowledgedBy
      ? { id: updated.acknowledgedBy.id, name: updated.acknowledgedBy.name }
      : null,
    tableLabel: updated.table.label,
    type: updated.type,
  });
  void emit({
    kind: "staff",
    id: dest.id,
    event: "request_handed_off_to_you",
    payload: {
      request: {
        id: updated.id,
        tableLabel: updated.table.label,
        type: updated.type,
        fromStaffId: existing.acknowledgedById,
      },
    },
  });

  return {
    ok: true,
    noChange: false,
    request: { id: updated.id, status: updated.status, acknowledgedById: updated.acknowledgedById },
  };
}
