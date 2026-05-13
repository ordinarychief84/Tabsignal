import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { newQrToken } from "@/lib/qr";
import { getStaffSession } from "@/lib/auth/session";
import { isOperator } from "@/lib/auth/operator";

const Body = z.object({
  ownerName: z.string().min(1).max(120),
  venueName: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, "ZIP must be 5 digits or 5+4"),
  timezone: z.string().min(1).default("America/Chicago"),
  posType: z.enum(["NONE", "TOAST", "SQUARE", "CLOVER"]).default("NONE"),
  googlePlaceId: z.string().max(120).optional(),
  tableCount: z.number().int().min(1).max(120).default(10),
});

// Concierge onboarding: only TabCall operators can create venues. New
// customers are onboarded by us creating their venue and sending a magic
// link to the manager. This closes the public DB-fill DOS vector.
export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!isOperator(session)) {
    return NextResponse.json(
      { error: "OPERATOR_ONLY", detail: "New venues are onboarded by TabCall. Email hello@tabcall.app." },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const detail = e instanceof z.ZodError
      ? e.errors.map(x => `${x.path.join(".") || "body"}: ${x.message}`).join("; ")
      : (e instanceof Error ? e.message : "");
    return NextResponse.json({ error: "INVALID_BODY", detail }, { status: 400 });
  }

  // Slug must be globally unique. If collision, append a 4-char suffix.
  let slug = slugify(parsed.venueName);
  const existing = await db.venue.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${newQrToken().slice(0, 4).toLowerCase()}`;

  const created = await db.organization.create({
    data: {
      name: parsed.ownerName,
      venues: {
        create: {
          slug,
          name: parsed.venueName,
          address: parsed.address ?? null,
          zipCode: parsed.zipCode,
          timezone: parsed.timezone,
          posType: parsed.posType,
          googlePlaceId: parsed.googlePlaceId ?? null,
          tables: {
            create: Array.from({ length: parsed.tableCount }, (_, i) => ({
              label: `Table ${i + 1}`,
              qrToken: newQrToken(),
            })),
          },
        },
      },
    },
    include: {
      venues: { include: { tables: true } },
    },
  });

  const venue = created.venues[0];
  return NextResponse.json(
    {
      orgId: created.id,
      venueId: venue.id,
      slug: venue.slug,
      tables: venue.tables.map(t => ({ id: t.id, label: t.label, qrToken: t.qrToken })),
    },
    { status: 201 }
  );
}
