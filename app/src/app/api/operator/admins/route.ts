/**
 * GET  /api/operator/admins  → list all platform admins (env + DB)
 * POST /api/operator/admins  → add a DB-backed admin
 *
 * Operator-only. The env-backed admins from OPERATOR_EMAILS are
 * read-only via this UI (changing them requires Vercel env edit +
 * redeploy); the DB-backed ones are mutable.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync, operatorAllowlist } from "@/lib/auth/operator";

const Body = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(120).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const dbAdmins = await db.platformAdmin.findMany({
    orderBy: [{ suspendedAt: "asc" }, { createdAt: "asc" }],
    include: {
      addedBy:     { select: { email: true, name: true } },
      suspendedBy: { select: { email: true, name: true } },
    },
  });

  // env-backed admins: surface alongside DB rows so the UI can show
  // a single combined list. Mark them source="env" so the UI knows
  // they can't be edited from the dashboard.
  const dbEmails = new Set(dbAdmins.map(a => a.email));
  const envAdmins = operatorAllowlist()
    .filter(e => !dbEmails.has(e))
    .map(email => ({
      id: `env:${email}`,
      email,
      name: null,
      notes: null,
      source: "env" as const,
      suspended: false,
      suspendedAt: null,
      suspendedBy: null,
      addedAt: null,
      addedBy: null,
      lastSeenAt: null,
      isYou: email === session.email.toLowerCase(),
    }));

  const dbItems = dbAdmins.map(a => ({
    id: a.id,
    email: a.email,
    name: a.name,
    notes: a.notes,
    source: "db" as const,
    suspended: a.suspendedAt !== null,
    suspendedAt: a.suspendedAt?.toISOString() ?? null,
    suspendedBy: a.suspendedBy ? { email: a.suspendedBy.email, name: a.suspendedBy.name } : null,
    addedAt: a.createdAt.toISOString(),
    addedBy: a.addedBy ? { email: a.addedBy.email, name: a.addedBy.name } : null,
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    isYou: a.email === session.email.toLowerCase(),
  }));

  return NextResponse.json({
    items: [...envAdmins, ...dbItems],
    selfEmail: session.email.toLowerCase(),
    envCount: envAdmins.length,
    dbCount: dbItems.length,
  });
}

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isPlatformStaffAsync(session))) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const email = parsed.email.toLowerCase().trim();

  // The actor's own platform-admin row, if any (used for addedBy
  // attribution). Skip self-FK if the actor is env-only.
  const actorRow = await db.platformAdmin.findUnique({
    where: { email: session.email.toLowerCase() },
    select: { id: true },
  });

  const existing = await db.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "ALREADY_EXISTS", id: existing.id },
      { status: 409 },
    );
  }

  const created = await db.platformAdmin.create({
    data: {
      email,
      name: parsed.name ?? null,
      notes: parsed.notes ?? null,
      addedById: actorRow?.id ?? null,
    },
  });

  return NextResponse.json({
    id: created.id,
    email: created.email,
    name: created.name,
    notes: created.notes,
    source: "db" as const,
    suspended: false,
  });
}
