import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { uploadToBucket } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A server's photo, as a guest sees it on the welcome screen.
 *
 * Same contract as the menu-image upload — field name `file`, returns a
 * URL — but a tighter gate. Two people may set it: whoever can assign
 * tables (they already decide who covers which room, so introducing them
 * is the same call), and the person themselves. Nobody else gets to put
 * a picture of a colleague in front of guests.
 *
 * Bucket `staff-photos`, path `<venueId>/<staffId>/<timestamp>.<ext>`,
 * timestamped rather than upserted so a stale CDN copy can't resurrect a
 * photo someone just replaced.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const target = await db.staffMember.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, venueId: true, name: true },
  });
  // Same answer for "no such person" and "not your venue" — the id can't
  // be used to probe another venue's roster.
  if (!target || target.venueId !== session.venueId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const isSelf = target.id === session.staffId;
  const role = session.role === "STAFF" ? "OWNER" : session.role;
  if (!isSelf && !can(role, "staff.assign_tables")) {
    return NextResponse.json(
      { error: "FORBIDDEN", detail: "Your role can't change how staff appear to guests." },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "EMPTY_FILE" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "FILE_TOO_LARGE", detail: `Max 4 MB. Got ${(file.size / 1024 / 1024).toFixed(1)} MB.` },
      { status: 413 },
    );
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(contentType)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_TYPE", detail: `Got ${contentType}. Allowed: PNG, JPG, WEBP.` },
      { status: 415 },
    );
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const result = await uploadToBucket({
    bucket: "staff-photos",
    path: `${target.venueId}/${target.id}/${Date.now()}.${ext}`,
    file,
    contentType,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "UPLOAD_FAILED", detail: result.error }, { status: 502 });
  }

  await db.staffMember.update({ where: { id: target.id }, data: { photoUrl: result.publicUrl } });

  void audit({
    venueId: target.venueId,
    actor: session,
    action: "staff.photo_updated",
    targetType: "StaffMember",
    targetId: target.id,
    metadata: { name: target.name, self: isSelf },
  });

  return NextResponse.json({ ok: true, url: result.publicUrl });
}
