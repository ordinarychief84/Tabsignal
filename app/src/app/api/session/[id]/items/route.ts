import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { LineItem as LineItemSchema, parseLineItems } from "@/lib/bill";

// TODO(auth): once NextAuth staff sessions are wired, require an authenticated
// staff member at the same venue as the session. For now this is unauthenticated
// so dev/seed flows work.
const Body = z.object({
  items: z.array(LineItemSchema).min(1),
  mode: z.enum(["append", "replace"]).default("append"),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof Error ? e.message : "bad body" },
      { status: 400 }
    );
  }

  const session = await db.guestSession.findUnique({ where: { id: ctx.params.id } });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if (session.paidAt) return NextResponse.json({ error: "ALREADY_PAID" }, { status: 410 });
  if (session.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 410 });
  }

  const existing = parseLineItems(session.lineItems);
  const next = parsed.mode === "replace" ? parsed.items : [...existing, ...parsed.items];

  const updated = await db.guestSession.update({
    where: { id: session.id },
    data: { lineItems: next },
  });

  return NextResponse.json({
    ok: true,
    sessionId: updated.id,
    items: parseLineItems(updated.lineItems),
  });
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await db.guestSession.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, lineItems: true, paidAt: true, expiresAt: true },
  });
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    sessionId: session.id,
    paid: !!session.paidAt,
    expired: session.expiresAt.getTime() <= Date.now(),
    items: parseLineItems(session.lineItems),
  });
}
