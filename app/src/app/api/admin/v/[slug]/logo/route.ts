import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gateAdminRoute } from "@/lib/plan-gate";
import { uploadToBucket } from "@/lib/storage";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Accepts a multipart/form-data upload with field name "file", uploads
 * to Supabase Storage bucket "venue-logos", and persists the public URL
 * on Venue.logoUrl. The path is `<venueId>/<timestamp>.<ext>` so each
 * upload is unique (we don't overwrite — old logos remain in the bucket
 * if you ever need to roll back, but the row only tracks the latest).
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "venue.upload_logo");
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "EMPTY_FILE" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "FILE_TOO_LARGE", detail: `Max 5 MB. Got ${(file.size / 1024 / 1024).toFixed(1)} MB.` },
      { status: 413 }
    );
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(contentType)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_TYPE", detail: `Got ${contentType}. Allowed: PNG, JPG, WEBP, SVG, GIF.` },
      { status: 415 }
    );
  }

  const ext = extFromMime(contentType);
  const path = `${gate.venueId}/${Date.now()}.${ext}`;

  const result = await uploadToBucket({
    bucket: "venue-logos",
    path,
    file,
    contentType,
    upsert: false,
  });
  if (!result.ok) {
    if (result.error === "STORAGE_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "STORAGE_NOT_CONFIGURED", detail: "Set SUPABASE_SERVICE_ROLE_KEY in env." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "UPLOAD_FAILED", detail: result.error }, { status: 502 });
  }

  await db.venue.update({
    where: { id: gate.venueId },
    data: { logoUrl: result.publicUrl },
  });

  return NextResponse.json({ logoUrl: result.publicUrl });
}

// Extension lookup. SVG ships as "image/svg+xml" so the dot-extension
// from a slash-split won't match — handle the corner case explicitly.
function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":     return "png";
    case "image/jpeg":
    case "image/jpg":     return "jpg";
    case "image/webp":    return "webp";
    case "image/svg+xml": return "svg";
    case "image/gif":     return "gif";
    default:              return "bin";
  }
}
