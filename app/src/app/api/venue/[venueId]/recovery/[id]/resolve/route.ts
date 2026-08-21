import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { originGuard } from "@/lib/csrf";
import { audit } from "@/lib/audit";

/**
 * Mark that someone went and spoke to the table.
 *
 * Idempotent: two managers both tapping it is an expected race in a busy
 * room, and the first stamp stands so the response time stays honest.
 *
 * Manager-tier only. The whole point of the escalation is that it reaches
 * someone senior to the server who received the rating, so letting that
 * server clear it themselves would defeat it.
 */
export async function POST(
  req: Request,
  ctx: { params: { venueId: string; id: string } },
) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (staff.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const role = staff.role === "STAFF" ? "OWNER" : staff.role;
  if (!can(role, "staff.assign_tables")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "A manager needs to handle this one." },
      { status: 403 },
    );
  }

  const report = await db.feedbackReport.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, venueId: true, recoveryResolvedAt: true, managerRecoveryRequested: true },
  });
  if (!report || report.venueId !== ctx.params.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!report.managerRecoveryRequested) {
    return NextResponse.json({ error: "NOT_A_RECOVERY" }, { status: 409 });
  }
  if (report.recoveryResolvedAt) {
    // Already handled by a colleague — not an error worth showing.
    return NextResponse.json({
      ok: true,
      alreadyResolved: true,
      resolvedAt: report.recoveryResolvedAt.toISOString(),
    });
  }

  const now = new Date();
  await db.feedbackReport.update({
    where: { id: report.id },
    data: { recoveryResolvedAt: now, recoveryResolvedById: staff.staffId, seenByMgr: true },
  });

  void audit({
    venueId: report.venueId,
    actor: staff,
    action: "feedback.recovery_resolved",
    targetType: "FeedbackReport",
    targetId: report.id,
  });

  return NextResponse.json({ ok: true, alreadyResolved: false, resolvedAt: now.toISOString() });
}
