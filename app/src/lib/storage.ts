/**
 * Thin wrapper over Supabase Storage's REST API. We use REST directly
 * instead of @supabase/supabase-js to keep the dep tree small — every
 * upload is a single multipart-PUT. Service-role key required.
 *
 * The function auto-creates a public bucket on first use if missing,
 * so a brand-new project doesn't require a manual setup step in
 * Supabase Studio.
 */

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — plenty for a logo.

export type UploadResult =
  | { ok: true; publicUrl: string; path: string }
  | { ok: false; error: string };

export async function uploadToBucket(args: {
  bucket: string;
  path: string;
  file: Blob;
  contentType: string;
  // If true, allow overwriting an existing object at the path. Logos should
  // overwrite — same venue, fresh upload supersedes the old one.
  upsert?: boolean;
}): Promise<UploadResult> {
  if (!ALLOWED_MIME.has(args.contentType)) {
    return { ok: false, error: `UNSUPPORTED_TYPE:${args.contentType}` };
  }
  if (args.file.size > MAX_BYTES) {
    return { ok: false, error: `TOO_LARGE:${args.file.size}` };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { ok: false, error: "STORAGE_NOT_CONFIGURED" };
  }

  // Lazy-create the bucket. Idempotent — if it exists, the create returns
  // 400/409 which we ignore. This trades one extra API call per upload for
  // zero manual setup steps.
  await ensureBucket(url, serviceKey, args.bucket).catch(() => undefined);

  const headers: HeadersInit = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": args.contentType,
    "x-upsert": args.upsert ? "true" : "false",
  };
  const objectUrl = `${url}/storage/v1/object/${encodeURIComponent(args.bucket)}/${args.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(objectUrl, { method: "POST", headers, body: args.file });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `UPLOAD_${res.status}:${body.slice(0, 240)}` };
  }

  const publicUrl = `${url}/storage/v1/object/public/${args.bucket}/${args.path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  return { ok: true, publicUrl, path: args.path };
}

async function ensureBucket(url: string, serviceKey: string, bucket: string): Promise<void> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  // Probe; if it returns 404 we create.
  const probe = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
    headers: { Authorization: `Bearer ${serviceKey}` },
  });
  if (probe.ok) return;
  await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      // 5 MB hard cap server-side — defense in depth.
      file_size_limit: MAX_BYTES,
      allowed_mime_types: [...ALLOWED_MIME],
    }),
  });
}
