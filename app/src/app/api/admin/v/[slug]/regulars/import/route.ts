import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { getStaffSession } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/sms";

/**
 * Tier 3e: cold-start CSV import.
 *
 * Pre-seeds GuestProfile rows (by phone) and optionally adds a starter
 * note pinned to this venue. Imported regulars don't show in the
 * regulars list until they have a paid session here — the import is
 * "have the dossier ready" rather than "create a phantom visit."
 *
 * Format (loose; we trim, drop blank lines, allow header row):
 *   phone,displayName,note
 *   +1-555-1234,Sarah,Allergic to peanuts
 *
 * Phone is required. displayName + note are optional. Quoted fields are
 * supported but escaping is minimal (no embedded commas inside notes
 * unless quoted). 500-row hard cap.
 */

const Body = z.object({
  csv: z.string().min(1).max(200_000),
  // Skip rows whose phone normalizes to null (rather than rejecting whole batch).
  skipInvalid: z.boolean().default(true),
});

const HARD_CAP = 500;

type ParsedRow = {
  phone: string;
  displayName: string | null;
  note: string | null;
};

type ParseError = { line: number; reason: string; raw: string };

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "pro", "regulars.edit");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try { parsed = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 }); }

  const { rows, errors } = parseCsv(parsed.csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: "NO_ROWS", errors }, { status: 400 });
  }
  if (rows.length > HARD_CAP) {
    return NextResponse.json({ error: "TOO_MANY_ROWS", maxRows: HARD_CAP }, { status: 413 });
  }

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { name: true },
  });
  const authorName = staff?.name ?? session.email;

  let created = 0;
  let updated = 0;
  let notesAdded = 0;

  for (const row of rows) {
    // Upsert by phone. Don't overwrite a non-null displayName with null
    // (otherwise re-importing a thinner CSV erases earlier data).
    const existing = await db.guestProfile.findUnique({
      where: { phone: row.phone },
      select: { id: true, displayName: true },
    });
    let profileId: string;
    if (existing) {
      profileId = existing.id;
      if (row.displayName && !existing.displayName) {
        await db.guestProfile.update({
          where: { id: existing.id },
          data: { displayName: row.displayName },
        });
      }
      updated += 1;
    } else {
      const fresh = await db.guestProfile.create({
        data: {
          phone: row.phone,
          displayName: row.displayName,
        },
        select: { id: true },
      });
      profileId = fresh.id;
      created += 1;
    }

    if (row.note) {
      // Skip duplicate import-source notes: if a note with identical
      // body already exists for this profile/venue, don't double-add.
      const dup = await db.guestNote.findFirst({
        where: { guestProfileId: profileId, venueId: gate.venueId, body: row.note, deletedAt: null },
        select: { id: true },
      });
      if (!dup) {
        await db.guestNote.create({
          data: {
            guestProfileId: profileId,
            venueId: gate.venueId,
            authorStaffId: session.staffId,
            authorName,
            body: row.note,
            pinned: false,
          },
        });
        notesAdded += 1;
      }
    }
  }

  return NextResponse.json({
    rowsAccepted: rows.length,
    rowsRejected: errors.length,
    profilesCreated: created,
    profilesUpdated: updated,
    notesAdded,
    errors: errors.slice(0, 50), // cap response size
  });
}

function parseCsv(text: string): { rows: ParsedRow[]; errors: ParseError[] } {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];
  const lines = text.split(/\r?\n/);
  let started = false;
  let lineNum = 0;
  for (const raw of lines) {
    lineNum += 1;
    const line = raw.trim();
    if (!line) continue;

    // Skip header (any row whose phone column doesn't normalize and the
    // first cell looks like a header keyword).
    if (!started) {
      const lower = line.toLowerCase();
      if (lower.startsWith("phone") || lower.startsWith("number") || lower.startsWith("guest")) {
        started = true;
        continue;
      }
      started = true;
    }

    const cells = splitCsvRow(line);
    const phoneRaw = cells[0]?.trim() ?? "";
    const displayName = (cells[1] ?? "").trim() || null;
    const note = (cells[2] ?? "").trim() || null;

    const phone = normalizePhone(phoneRaw);
    if (!phone) {
      errors.push({ line: lineNum, reason: "INVALID_PHONE", raw });
      continue;
    }
    rows.push({ phone, displayName, note });
  }
  return { rows, errors };
}

// Minimal CSV cell splitter — supports quoted cells with literal commas,
// double-quote escapes (""), and unquoted cells. Adequate for the
// expected hand-curated lists; not a full RFC 4180 parser.
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        buf += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        buf += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(buf);
        buf = "";
      } else {
        buf += ch;
      }
    }
  }
  out.push(buf);
  return out;
}
