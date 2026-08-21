import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { originGuard } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { previewAudience, materialiseRecipients, messagingConfigured } from "@/lib/campaigns";

/**
 * Campaign management for a venue.
 *
 * Composing, scheduling and audience resolution are all real and persist.
 * Sending is not — no SMS provider is configured — so a campaign created
 * here stays DRAFT or SCHEDULED and never claims to have been delivered.
 * The response says so explicitly rather than letting the UI guess.
 *
 * Marketing is an owner/manager concern: campaigns reach people who gave
 * their number to this venue, and the roles that can see those numbers are
 * the roles that can message them.
 */

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  audienceType: z.enum(["ALL_SUBSCRIBED", "VISITED_LAST_30_DAYS", "RETURNING_GUESTS"]),
  scheduledAt: z.string().datetime().nullable().optional(),
});

async function authorise(slug: string) {
  const session = await getStaffSession();
  if (!session) return { error: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };

  const venue = await db.venue.findUnique({ where: { slug }, select: { id: true } });
  if (!venue || venue.id !== session.venueId) {
    return { error: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }
  // Same tier that may see guest phone numbers — marketing to a list you
  // aren't trusted to look at makes no sense.
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "venue.edit_settings")) {
    return {
      error: NextResponse.json(
        { error: "FORBIDDEN", detail: "Your role can't manage campaigns." },
        { status: 403 },
      ),
    };
  }
  return { session, venueId: venue.id };
}

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  const auth = await authorise(ctx.params.slug);
  if ("error" in auth) return auth.error;

  const [campaigns, all, recent, returning] = await Promise.all([
    db.campaign.findMany({
      where: { venueId: auth.venueId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, name: true, message: true, audienceType: true, status: true,
        scheduledAt: true, sentAt: true, createdAt: true,
        _count: { select: { recipients: true } },
      },
    }),
    previewAudience(auth.venueId, "ALL_SUBSCRIBED"),
    previewAudience(auth.venueId, "VISITED_LAST_30_DAYS"),
    previewAudience(auth.venueId, "RETURNING_GUESTS"),
  ]);

  return NextResponse.json({
    campaigns,
    audiences: [all, recent, returning],
    // The UI uses this to explain why sending is unavailable rather than
    // showing a button that silently does nothing.
    messagingConfigured: messagingConfigured(),
  });
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const auth = await authorise(ctx.params.slug);
  if ("error" in auth) return auth.error;

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors.map(x => x.message).join("; ") : "";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  const campaign = await db.campaign.create({
    data: {
      venueId: auth.venueId,
      name: parsed.name,
      message: parsed.message,
      audienceType: parsed.audienceType,
      scheduledAt: parsed.scheduledAt ? new Date(parsed.scheduledAt) : null,
      status: parsed.scheduledAt ? "SCHEDULED" : "DRAFT",
    },
    select: { id: true, name: true, status: true, audienceType: true },
  });

  // Freeze the audience now so the owner sees who it would reach. Consent
  // is re-checked at send time too — anyone who opts out in between is
  // dropped, because the audience is resolved fresh on dispatch.
  const eligible = await materialiseRecipients(campaign.id);

  void audit({
    venueId: auth.venueId,
    actor: auth.session,
    action: "campaign.created",
    targetType: "Campaign",
    targetId: campaign.id,
    metadata: { name: campaign.name, audience: campaign.audienceType, eligible },
  });

  return NextResponse.json(
    {
      campaign,
      eligible,
      messagingConfigured: messagingConfigured(),
      // Stated plainly. Nothing here has been sent.
      note: messagingConfigured()
        ? undefined
        : "Saved. No SMS provider is connected, so nothing has been sent.",
    },
    { status: 201 },
  );
}
