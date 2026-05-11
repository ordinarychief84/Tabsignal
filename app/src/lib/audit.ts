/**
 * Audit log emit helper. Wraps the AuditLog model with a small,
 * fire-and-forget API so call sites (admin routes) read cleanly:
 *
 *   await audit({
 *     venueId: venue.id,
 *     actor: session,
 *     action: "staff.role_changed",
 *     targetType: "StaffMember",
 *     targetId: staff.id,
 *     metadata: { fromRole: "SERVER", toRole: "MANAGER", email: staff.email },
 *   });
 *
 * Fire-and-forget semantics: the helper never throws — an audit emit
 * failing must NOT take down a successful staff-management action.
 * Failures land in console.error so they're picked up by Sentry +
 * Vercel logs.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { SessionClaims } from "@/lib/auth/token";

export type AuditActor = Pick<SessionClaims, "email" | "role"> | { email: string; role: string };

export type AuditArgs = {
  venueId: string;
  actor: AuditActor;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export async function audit(args: AuditArgs): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        venueId: args.venueId,
        actorEmail: args.actor.email.toLowerCase(),
        actorRole: args.actor.role ?? "UNKNOWN",
        action: args.action,
        targetType: args.targetType ?? null,
        targetId: args.targetId ?? null,
        metadata: (args.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[audit] emit failed", {
      venueId: args.venueId,
      action: args.action,
      message: (err as Error).message,
    });
  }
}
