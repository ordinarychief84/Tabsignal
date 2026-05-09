import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";

export async function DELETE(_req: Request, ctx: { params: { orgId: string; id: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });
  if (!canBroadcast(access.role)) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Removing members requires OWNER or ADMIN." }, { status: 403 });
  }

  const member = await db.orgMember.findUnique({ where: { id: ctx.params.id } });
  if (!member || member.orgId !== ctx.params.orgId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Refuse to delete the last OWNER. Locking yourself out is bad UX.
  if (member.role === "OWNER") {
    const owners = await db.orgMember.count({
      where: { orgId: ctx.params.orgId, role: "OWNER" },
    });
    if (owners <= 1) {
      return NextResponse.json(
        { error: "LAST_OWNER", detail: "Promote another member to OWNER first." },
        { status: 409 }
      );
    }
  }

  await db.orgMember.delete({ where: { id: member.id } });
  console.info(
    `[operator:member-remove] orgId=${ctx.params.orgId} email=${member.email} role=${member.role} ` +
    `by=${session?.email ?? "?"}`
  );
  return NextResponse.json({ ok: true });
}
