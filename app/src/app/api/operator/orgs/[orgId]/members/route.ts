import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";

const Body = z.object({
  email: z.string().email().max(200),
  role: z.enum(["OWNER", "ADMIN", "VIEWER"]).default("VIEWER"),
});

export async function GET(_req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });

  const members = await db.orgMember.findMany({
    where: { orgId: ctx.params.orgId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    members: members.map(m => ({
      id: m.id,
      email: m.email,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });
  if (!canBroadcast(access.role)) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Adding members requires OWNER or ADMIN." }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const email = parsed.email.toLowerCase().trim();

  // Idempotent on email: if it already exists, update role; otherwise create.
  const existing = await db.orgMember.findUnique({
    where: { orgId_email: { orgId: ctx.params.orgId, email } },
  });
  if (existing) {
    if (existing.role === parsed.role) {
      return NextResponse.json({ id: existing.id, email, role: existing.role, alreadyMember: true });
    }
    const updated = await db.orgMember.update({
      where: { id: existing.id },
      data: { role: parsed.role },
    });
    return NextResponse.json({ id: updated.id, email, role: updated.role, roleUpdated: true });
  }

  const created = await db.orgMember.create({
    data: { orgId: ctx.params.orgId, email, role: parsed.role },
  });
  console.info(
    `[operator:member-add] orgId=${ctx.params.orgId} email=${email} role=${parsed.role} ` +
    `by=${session?.email ?? "?"}`
  );
  return NextResponse.json({ id: created.id, email, role: created.role });
}
