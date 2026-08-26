import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { originGuard } from "@/lib/csrf";
import { audit } from "@/lib/audit";
import { mergeGuestExperience, GUEST_EXPERIENCE_KEYS } from "@/lib/guest-experience";
import { mergeVisitProgram, MAX_LABEL, MAX_VISITS, MIN_VISITS } from "@/lib/visit-progress";
import type { Prisma } from "@prisma/client";

/**
 * Guest-experience configuration.
 *
 * Merges into Venue.enabledFeatures rather than overwriting it — the
 * column predates this feature and may hold keys owned by other parts of
 * the app.
 */

const Config = z.object(
  Object.fromEntries(GUEST_EXPERIENCE_KEYS.map(k => [k, z.boolean().optional()])),
) as z.ZodType<Record<string, boolean | undefined>>;

/**
 * The returning-guest scheme.
 *
 * `rewardLabel` is free text on purpose: it is the venue's own promise,
 * shown to a guest exactly as written. TabCall has no vocabulary of
 * rewards to offer instead, because it can't take anything off a bill it
 * can't see — inventing one would put words in the venue's mouth at
 * their own table.
 */
const VisitProgram = z.object({
  enabled: z.boolean().optional(),
  visitsRequired: z.number().int().min(MIN_VISITS).max(MAX_VISITS).optional(),
  rewardLabel: z.string().max(MAX_LABEL).optional(),
  programName: z.string().max(MAX_LABEL).optional(),
});

const Body = z.object({
  config: Config,
  guestWelcomeMessage: z.string().max(500).nullable().optional(),
  visitProgram: VisitProgram.optional(),
});

export async function PATCH(req: Request, ctx: { params: { slug: string } }) {
  const guard = originGuard(req);
  if (guard) return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const venue = await db.venue.findUnique({
    where: { slug: ctx.params.slug },
    select: { id: true, enabledFeatures: true },
  });
  if (!venue || venue.id !== session.venueId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!can(role, "venue.edit_settings")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't change venue settings." },
      { status: 403 },
    );
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError ? e.errors.map(x => x.message).join("; ") : "";
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  await db.venue.update({
    where: { id: venue.id },
    data: {
      // The column is free-form JSON; the merge helper preserves any keys
      // other parts of the app own.
      // Two merges over the same free-form column, both preserving keys
      // other parts of the app own. Sequenced rather than combined so
      // neither helper has to know about the other's shape.
      enabledFeatures: mergeVisitProgram(
        mergeGuestExperience(venue.enabledFeatures, parsed.config),
        parsed.visitProgram ?? {},
      ) as Prisma.InputJsonValue,
      ...(parsed.guestWelcomeMessage !== undefined
        ? { guestWelcomeMessage: parsed.guestWelcomeMessage }
        : {}),
    },
  });

  void audit({
    venueId: venue.id,
    actor: session,
    action: "venue.guest_experience_updated",
    targetType: "Venue",
    targetId: venue.id,
    metadata: { config: parsed.config, visitProgram: parsed.visitProgram ?? null },
  });

  return NextResponse.json({ ok: true });
}
