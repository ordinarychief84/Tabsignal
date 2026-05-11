/**
 * PATCH  /api/operator/admins/[id]  → suspend / reactivate / edit notes
 * DELETE /api/operator/admins/[id]  → hard-remove
 *
 * Operator-only. Self-action protection: you can't suspend or remove
 * your own row. Last-active-admin protection: prevents leaving the
 * platform with zero active admins (counting env + DB).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync, operatorAllowlist } from "@/lib/auth/operator";

type Ctx = { params: { id: string } };

const PatchBody = z.object({
  suspended: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  name: z.string().min(1).max(120).optional(),
});

async function activeAdminCount(): Promise<number> {
  const dbActive = await db.platformAdmin.count({ where: { suspendedAt: null } });
  return dbActive + operatorAllowlist().length;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const target = await db.platformAdmin.findUnique({ where: { id: ctx.params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  if (parsed.suspended !== undefined) {
    if (target.email === session.email.toLowerCase()) {
      return NextResponse.json(
        { error: "SELF_SUSPEND", detail: "You can't suspend yourself." },
        { status: 409 },
      );
    }
    if (parsed.suspended && target.suspendedAt === null) {
      // Check we're not leaving zero active admins.
      const remaining = (await activeAdminCount()) - 1;
      if (remaining < 1) {
        return NextResponse.json(
          { error: "LAST_ADMIN", detail: "Can't suspend the last active admin." },
          { status: 409 },
        );
      }
      const actorRow = await db.platformAdmin.findUnique({
        where: { email: session.email.toLowerCase() },
        select: { id: true },
      });
      await db.platformAdmin.update({
        where: { id: target.id },
        data: {
          suspendedAt: new Date(),
          suspendedById: actorRow?.id ?? null,
        },
      });
    } else if (!parsed.suspended && target.suspendedAt !== null) {
      await db.platformAdmin.update({
        where: { id: target.id },
        data: { suspendedAt: null, suspendedById: null },
      });
    }
  }

  const dataUpdate: { name?: string; notes?: string } = {};
  if (parsed.name !== undefined) dataUpdate.name = parsed.name;
  if (parsed.notes !== undefined) dataUpdate.notes = parsed.notes;
  if (Object.keys(dataUpdate).length > 0) {
    await db.platformAdmin.update({ where: { id: target.id }, data: dataUpdate });
  }

  const fresh = await db.platformAdmin.findUnique({ where: { id: target.id } });
  return NextResponse.json({
    id: fresh!.id,
    email: fresh!.email,
    name: fresh!.name,
    notes: fresh!.notes,
    suspended: fresh!.suspendedAt !== null,
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const target = await db.platformAdmin.findUnique({ where: { id: ctx.params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (target.email === session.email.toLowerCase()) {
    return NextResponse.json(
      { error: "SELF_REMOVE", detail: "You can't remove yourself. Add another admin first, then ask them to remove you." },
      { status: 409 },
    );
  }
  // Last-admin guard: count active admins remaining if we delete this
  // one. Only meaningful if the target was active.
  if (target.suspendedAt === null) {
    const remaining = (await activeAdminCount()) - 1;
    if (remaining < 1) {
      return NextResponse.json(
        { error: "LAST_ADMIN", detail: "Can't remove the last active admin." },
        { status: 409 },
      );
    }
  }
  await db.platformAdmin.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true });
}
