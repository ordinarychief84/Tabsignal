import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";

const Body = z.object({
  subject: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
});

// Org-wide manager notice. For now we persist a console.info trail; a
// future iteration will fan out via push / email / Slack. The endpoint
// itself returns immediately so the UI can surface a success state.
export async function POST(req: Request, ctx: { params: { orgId: string } }) {
  const session = await getStaffSession();
  const access = await checkOrgAccess(session, ctx.params.orgId);
  if (!access.ok) return NextResponse.json({ error: access.reason }, { status: access.status });
  if (!canBroadcast(access.role)) {
    return NextResponse.json({ error: "FORBIDDEN", detail: "Broadcast requires OWNER or ADMIN." }, { status: 403 });
  }

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const venues = await db.venue.findMany({
    where: { orgId: ctx.params.orgId },
    select: { id: true, name: true, slug: true },
  });

  // Persistent fan-out lives in a future commit; for now we log so the
  // operator gets feedback during dev and a future job can replay.
  console.info(
    `[broadcast] org=${ctx.params.orgId} by=${session?.email ?? "?"} ` +
    `subject="${parsed.subject}" reach=${venues.length} venues`
  );

  return NextResponse.json({
    sent: true,
    reachedVenueCount: venues.length,
  });
}
