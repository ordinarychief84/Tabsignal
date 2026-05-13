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
const SCRIPT_SCAN_BYTES = 8 * 1024; // first 8 KB of body

// Match `<script` with optional whitespace between `<` and `script` so a
// crafted payload like `< script>` doesn't slip past. Case-insensitive.
const SCRIPT_TAG_RE = /<\s*script\b/i;

/**
 * Accepts a multipart/form-data upload with field name "file", uploads
 * to the `venue-branding` Supabase Storage bucket (separate from the
 * legacy `venue-logos` bucket used by the older /logo endpoint), and
 * upserts the public URL onto VenueBranding.logoUrl.
 *
 * SVG anti-XSS: the first 4 KB of the buffer is scanned for `<script`
 * (case-insensitive) and the upload is refused on match. SVG is an XML
 * document that browsers happily execute when rendered inline, so we
 * close that vector here even though we trust the manager-tier caller.
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

  // Anti-XSS sniff: read first 8 KB and refuse if the upload looks like a
  // script-bearing SVG. Cheaper than parsing the XML, catches the common
  // `<script>...</script>` payload (whitespace-tolerant so `< script>` is
  // rejected too).
  const headBuf = await file.slice(0, SCRIPT_SCAN_BYTES).arrayBuffer();
  const head = new TextDecoder("utf-8", { fatal: false }).decode(headBuf);
  if (SCRIPT_TAG_RE.test(head)) {
    return NextResponse.json(
      { error: "UNSAFE_SVG", detail: "Upload contains <script>; refused." },
      { status: 422 },
    );
  }

  const ext = extFromMime(contentType);
  const path = `${gate.venueId}/logo-${Date.now()}.${ext}`;

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

  // Upsert so the row exists even on first upload — venueId is UNIQUE.
  await db.venueBranding.upsert({
    where: { venueId: gate.venueId },
    create: { venueId: gate.venueId, logoUrl: result.publicUrl },
    update: { logoUrl: result.publicUrl },
  });

  return NextResponse.json({ logoUrl: result.publicUrl });
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
