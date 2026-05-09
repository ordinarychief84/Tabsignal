"use client";

import { useId, useRef, useState } from "react";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT_LABEL = "PNG, JPG, WEBP, SVG, GIF · max 5 MB";

export function LogoUpload({
  slug,
  initialUrl,
}: {
  slug: string;
  initialUrl: string | null;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (file.size === 0) {
      setError("File is empty.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; max is 5 MB.`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/v/${slug}/logo`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setLogoUrl(body.logoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/v/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setLogoUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't clear");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void upload(f);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  }

  return (
    <div className="border-b border-slate/5 py-3 last:border-0">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Logo</p>
      <p className="mt-1 text-[11px] text-slate/55">{ACCEPT_LABEL}. Square or near-square works best.</p>

      <div className="mt-3 flex items-start gap-4">
        <div
          className={[
            "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white",
            dragOver ? "border-chartreuse ring-2 ring-chartreuse/30" : "border-slate/15",
          ].join(" ")}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {logoUrl ? (
            // Avoid Next/Image since the URL is supabase-hosted and
            // requires whitelisting. <img> is fine for an 80px preview.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Venue logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-slate/40">no logo</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={fileRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            onChange={onPick}
            disabled={busy}
            className="hidden"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor={inputId}
              className={[
                "inline-flex cursor-pointer items-center rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-sm text-slate hover:border-slate/40",
                busy ? "pointer-events-none opacity-60" : "",
              ].join(" ")}
            >
              {busy ? "Uploading…" : logoUrl ? "Replace logo" : "Choose file"}
            </label>
            {logoUrl ? (
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className="text-[12px] text-coral underline-offset-4 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
            <span className="text-[11px] text-slate/45">or drag and drop into the box</span>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-xs text-coral">{error}</p>
          ) : null}
          {logoUrl ? (
            <p className="mt-2 break-all font-mono text-[10px] text-slate/40">
              {logoUrl}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
