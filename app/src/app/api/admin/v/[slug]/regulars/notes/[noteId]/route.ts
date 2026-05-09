import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { getStaffSession } from "@/lib/auth/session";

const PatchBody = z.object({
  body: z.string().min(1).max(2000).optional(),
  pinned: z.boolean().optional(),
});

async function gateNote(slug: string, noteId: string) {
  const gate = await gateAdminRoute(slug, "pro");
  if (!gate.ok) return gate;
  const session = await getStaffSession();
  if (!session) return { ok: false as const, status: 401, body: { error: "UNAUTHORIZED" } };
  const note = await db.guestNote.findUnique({ where: { id: noteId } });
  if (!note || note.venueId !== gate.venueId || note.deletedAt) {
    return { ok: false as const, status: 404, body: { error: "NOT_FOUND" } };
  }
  return { ok: true as const, venueId: gate.venueId, note, session };
}

export async function PATCH(req: Request, ctx: { params: { slug: string; noteId: string } }) {
  const gate = await gateNote(ctx.params.slug, ctx.params.noteId);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PatchBody.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const data: Record<string, unknown> = {};
  if (parsed.body !== undefined) data.body = parsed.body;
  if (parsed.pinned !== undefined) data.pinned = parsed.pinned;
  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

  await db.guestNote.update({ where: { id: gate.note.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: { slug: string; noteId: string } }) {
  const gate = await gateNote(ctx.params.slug, ctx.params.noteId);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  // Soft delete so an accidental tap is recoverable.
  await db.guestNote.update({
    where: { id: gate.note.id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
