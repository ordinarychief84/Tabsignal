import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { newQrToken } from "@/lib/qr";
import { gateAdminRoute } from "@/lib/plan-gate";
import { meetsAtLeast } from "@/lib/plans";

const PostBody = z.object({
  // Either: { label } single, or { count } bulk-add as "Table N+1"…"Table N+count".
  label: z.string().min(1).max(40).optional(),
  count: z.number().int().min(1).max(60).optional(),
  zone: z.string().max(40).optional(),
}).refine(b => !!b.label || !!b.count, { message: "label_or_count_required" });

// Tables CRUD is a Starter-tier feature — every venue needs at least one
// table to take a bill. We still gate by venue ownership, just not by plan.
async function gateAdminAnyPlan(slug: string) {
  const gate = await gateAdminRoute(slug, "free");
  if (gate.ok) return gate;
  // gateAdminRoute would only fail at "free" if the unauth/no-venue path
  // tripped, not the plan path. Pass the failure through.
  return gate;
}

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminAnyPlan(ctx.params.slug);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const tables = await db.table.findMany({
    where: { venueId: gate.venueId },
    orderBy: { label: "asc" },
    include: { _count: { select: { sessions: true, requests: true, preOrders: true } } },
  });

  return NextResponse.json({
    tables: tables.map(t => ({
      id: t.id,
      label: t.label,
      qrToken: t.qrToken,
      zone: t.zone,
      createdAt: t.createdAt.toISOString(),
      sessionCount: t._count.sessions,
      requestCount: t._count.requests,
      preOrderCount: t._count.preOrders,
    })),
  });
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminAnyPlan(ctx.params.slug);
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let parsed;
  try { parsed = PostBody.parse(await req.json()); }
  catch (e) {
    return NextResponse.json({ error: "INVALID_BODY", detail: e instanceof Error ? e.message : "" }, { status: 400 });
  }

  // Single label add — must be unique within venue.
  if (parsed.label) {
    const exists = await db.table.findUnique({
      where: { venueId_label: { venueId: gate.venueId, label: parsed.label } },
    });
    if (exists) return NextResponse.json({ error: "LABEL_TAKEN" }, { status: 409 });

    const created = await db.table.create({
      data: {
        venueId: gate.venueId,
        label: parsed.label,
        qrToken: newQrToken(),
        zone: parsed.zone ?? null,
      },
    });
    return NextResponse.json({ id: created.id, label: created.label, qrToken: created.qrToken });
  }

  // Bulk add — pick the next "Table N" labels that aren't taken.
  const count = parsed.count!;
  const existing = await db.table.findMany({
    where: { venueId: gate.venueId },
    select: { label: true },
  });
  const taken = new Set(existing.map(t => t.label));
  const created: Array<{ id: string; label: string; qrToken: string }> = [];
  let i = 1;
  while (created.length < count) {
    const label = `Table ${i++}`;
    if (taken.has(label)) continue;
    const row = await db.table.create({
      data: {
        venueId: gate.venueId,
        label,
        qrToken: newQrToken(),
        zone: parsed.zone ?? null,
      },
    });
    created.push({ id: row.id, label: row.label, qrToken: row.qrToken });
    if (i > 1000) break; // safety
  }
  // Plan-aware nudge: large fleets imply Pro.
  const plan = gate.plan;
  const note = (created.length >= 10 && !meetsAtLeast(plan, "growth"))
    ? "Many tables — consider upgrading to Growth for analytics + tip pooling."
    : null;
  return NextResponse.json({ created, note });
}
