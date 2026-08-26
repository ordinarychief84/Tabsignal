import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { originGuard } from "@/lib/csrf";
import { uploadToBucket } from "@/lib/storage";
import { imageUrl } from "@/lib/image-url";

/**
 * A server's own guest-facing profile.
 *
 * Exactly three fields, and they are the three a GUEST sees: the name
 * they go by on the floor, their photo, and their welcome message.
 * Everything else on a StaffMember row is off limits here — venue, role,
 * permissions, table assignments, status, email — and not by omission
 * from a form but by an allowlist on the way in. A self-service endpoint
 * that took a partial StaffMember would be a role-escalation waiting for
 * somebody to notice.
 *
 * SELF-SCOPED. It takes no id and always writes the signed-in row, so
 * there is no shape of request that edits a colleague's profile.
 * Managers already edit anyone's guest-facing fields through
 * /api/admin/staff/[id], which keeps §36's "venue owner retains control"
 * true without a second approval queue nobody asked to operate.
 *
 * `name` stays untouchable here on purpose. It can be a legal name on an
 * employment record; `displayName` is what a stranger's phone shows.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const staff = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: {
      name: true,
      displayName: true,
      photoUrl: true,
      welcomeMessage: true,
      section: true,
      role: true,
      venue: { select: { name: true, guestWelcomeMessage: true } },
    },
  });
  if (!staff) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    name: staff.name,
    displayName: staff.displayName,
    photoUrl: staff.photoUrl,
    welcomeMessage: staff.welcomeMessage,
    // Read-only context, so the page can show what a guest would see if
    // this server writes nothing — and make clear these are the venue's
    // to change, not theirs.
    section: staff.section,
    role: staff.role,
    venueName: staff.venue.name,
    venueWelcomeMessage: staff.venue.guestWelcomeMessage,
  });
}

const Body = z.object({
  // Empty string means "clear it and fall back to the venue's default",
  // which is a thing a server should be able to do without asking.
  displayName: z.string().trim().max(40).nullable().optional(),
  welcomeMessage: z.string().trim().max(400).nullable().optional(),
  photoUrl: imageUrl.nullable().optional(),
});

export async function PATCH(req: Request) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: e instanceof z.ZodError ? e.errors[0]?.message : undefined },
      { status: 400 },
    );
  }

  const current = await db.staffMember.findUnique({
    where: { id: session.staffId },
    select: { id: true, status: true },
  });
  // A suspended or deleted account may not keep editing what guests see.
  if (!current || current.status !== "ACTIVE") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Build the update from the allowlist, never from the parsed body
  // wholesale. Empty strings become null so a cleared field falls back
  // to the venue default rather than showing a blank name.
  const data: { displayName?: string | null; welcomeMessage?: string | null; photoUrl?: string | null } = {};
  if (parsed.displayName !== undefined) data.displayName = parsed.displayName || null;
  if (parsed.welcomeMessage !== undefined) data.welcomeMessage = parsed.welcomeMessage || null;
  if (parsed.photoUrl !== undefined) data.photoUrl = parsed.photoUrl || null;

  const updated = await db.staffMember.update({
    where: { id: current.id },
    data,
    select: { displayName: true, photoUrl: true, welcomeMessage: true },
  });

  return NextResponse.json(updated);
}

/**
 * Photo upload.
 *
 * Lives on the same route as a POST rather than in its own file because
 * it writes one field of the same resource. Bucket path is keyed on the
 * staff id, so a server can only ever overwrite their own images.
 */
export async function POST(req: Request) {
  const guard = originGuard(req);
  if (guard) {
    return NextResponse.json({ error: guard.error, detail: guard.detail }, { status: guard.status });
  }

  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "NO_FILE" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_TYPE", detail: "Use a PNG, JPEG or WebP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "TOO_LARGE", detail: "Photos must be under 3 MB." },
      { status: 400 },
    );
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${session.venueId}/${session.staffId}/${Date.now()}.${ext}`;

  try {
    const result = await uploadToBucket({
      bucket: "staff-photos",
      path,
      file,
      contentType: file.type,
      // Fresh upload supersedes the old one at the same path; the path
      // is timestamped anyway, so this only matters on a double-submit.
      upsert: true,
    });
    if (!result.ok) throw new Error(result.error);

    const updated = await db.staffMember.update({
      where: { id: session.staffId },
      data: { photoUrl: result.publicUrl },
      select: { photoUrl: true },
    });
    return NextResponse.json(updated);
  } catch {
    // Storage being unconfigured is a deployment state, not something a
    // server on the floor can fix — say so plainly rather than 500ing.
    return NextResponse.json(
      { error: "UPLOAD_FAILED", detail: "Couldn't save that photo. Try again." },
      { status: 502 },
    );
  }
}
