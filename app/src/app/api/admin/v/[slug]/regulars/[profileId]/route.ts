import { NextResponse } from "next/server";
import { gateAdminRoute } from "@/lib/plan-gate";
import { dossierFor } from "@/lib/regulars";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { slug: string; profileId: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const dossier = await dossierFor(ctx.params.profileId, gate.venueId);
  if (!dossier) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(dossier);
}
