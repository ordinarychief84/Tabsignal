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
const SCRIPT_SCAN_BYTES = 4 * 1024;

/**
 * Banner image upload — same shape as /branding/logo. Separate route so
 * the form field semantics stay obvious (one upload per kind) and so we
 * can tweak the path naming or per-field validation independently later.
 *
 * Both write to the `venue-branding` bucket. The path prefix
 * ("logo-" vs "banner-") keeps the two image kinds glanceable in
 * Supabase Studio.
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "free", "branding.manage");
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
      { status: 413 },
    );
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(contentType)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_TYPE", detail: `Got ${contentType}. Allowed: PNG, JPG, WEBP, SVG, GIF.` },
      { status: 415 },
    );
  }

  // Anti-XSS sniff — see /branding/logo for rationale.
  const headBuf = await file.slice(0, SCRIPT_SCAN_BYTES).arrayBuffer();
  const head = new TextDecoder("utf-8", { fatal: false }).decode(headBuf);
  if (/<script/i.test(head)) {
    return NextResponse.json(
      { error: "UNSAFE_SVG", detail: "Upload contains <script>; refused." },
      { status: 422 },
    );
  }

  const ext = extFromMime(contentType);
  const path = `${gate.venueId}/banner-${Date.now()}.${ext}`;

  const result = await uploadToBucket({
    bucket: "venue-branding",
    path,
    file,
    contentType,
    upsert: false,
  });
  if (!result.ok) {
    if (result.error === "STORAGE_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "STORAGE_NOT_CONFIGURED", detail: "Set SUPABASE_SERVICE_ROLE_KEY in env." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "UPLOAD_FAILED", detail: result.error }, { status: 502 });
  }

  await db.venueBranding.upsert({
    where: { venueId: gate.venueId },
    create: { venueId: gate.venueId, bannerImageUrl: result.publicUrl },
    update: { bannerImageUrl: result.publicUrl },
  });

  return NextResponse.json({ bannerImageUrl: result.publicUrl });
}

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
