import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { newQrToken } from "@/lib/qr";

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

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.errors.map(x => x.message).join("; ") : "INVALID_BODY";
    return NextResponse.json({ error: msg }, { status: 400 });
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
