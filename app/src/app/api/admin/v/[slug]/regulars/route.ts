import { NextResponse } from "next/server";
import { gateAdminRoute } from "@/lib/plan-gate";
import { listRegulars } from "@/lib/regulars";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const rows = await listRegulars(gate.venueId);
  return NextResponse.json({ regulars: rows });
}
