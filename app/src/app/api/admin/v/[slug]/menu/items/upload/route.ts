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
]);

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — menu pics shouldn't need more

/**
 * Multipart upload for menu-item images. Mirrors the venue-logo
 * upload contract: field name `file`, optional `itemId` for in-place
 * patches (otherwise the caller PATCHes the menu item with the
 * returned imageUrl on save).
 *
 * Bucket: `menu-images`. Path: `<venueId>/<itemIdOrTmp>/<timestamp>.<ext>`.
 * Old images stay in the bucket if the row is updated to a new URL —
 * we don't bother with garbage-collection because cost is negligible.
 *
 * Permission gate: `menu.edit` (the same key the categories/items
 * endpoints already use). Plan gate: `growth` because menu management
 * is a paid-tier feature today.
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const gate = await gateAdminRoute(ctx.params.slug, "growth", "menu.edit");
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

  // Optional `itemId` lets the form upload + persist in one round-trip.
  // Verify the item belongs to this venue before accepting — defense
  // against an authenticated user from venue A patching venue B's
  // images by passing a foreign itemId.
  const rawItemId = form.get("itemId");
  const itemId = typeof rawItemId === "string" && rawItemId.length > 0 ? rawItemId : null;
  if (itemId) {
    const owned = await db.menuItem.findUnique({
      where: { id: itemId },
      select: { id: true, venueId: true },
    });
    if (!owned || owned.venueId !== gate.venueId) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
  }

  const ext = extFromMime(contentType);
  const pathPrefix = itemId ?? "tmp";
  const path = `${gate.venueId}/${pathPrefix}/${Date.now()}.${ext}`;

  const result = await uploadToBucket({
    bucket: "menu-images",
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

  // If the caller passed an itemId, persist the URL on that row so
  // the menu page updates in one request. Without itemId (create
  // flow), the form holds the URL until the user clicks Save.
  if (itemId) {
    await db.menuItem.update({
      where: { id: itemId },
      data: { imageUrl: result.publicUrl },
    });
  }

  return NextResponse.json({ imageUrl: result.publicUrl });
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":  return "png";
    case "image/jpeg":
    case "image/jpg":  return "jpg";
    case "image/webp": return "webp";
    default:           return "bin";
  }
}
