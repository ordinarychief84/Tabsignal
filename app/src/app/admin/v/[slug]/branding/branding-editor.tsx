"use client";

import { useEffect, useRef, useState } from "react";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/gif";
const ACCEPT_LABEL = "PNG, JPG, WEBP, SVG, GIF · max 5 MB";
const MAX_BYTES = 5 * 1024 * 1024;
const FONT_PRESETS = ["Inter", "system-ui", "Georgia"] as const;

type BrandingState = {
  logoUrl: string | null;
  bannerImageUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  welcomeMessage: string | null;
};

type LegacyFallback = {
  brandColor: string | null;
  logoUrl: string | null;
  guestWelcomeMessage: string | null;
};

type Props = {
  slug: string;
  venueName: string;
  initial: BrandingState;
  legacy: LegacyFallback;
};

const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export function BrandingEditor({ slug, venueName, initial, legacy }: Props) {
  const [state, setState] = useState<BrandingState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolved (effective) values for the preview — branding row wins,
  // legacy Venue fields fill in the gaps. Mirror the server-side
  // resolveBrandingWithFallback so the preview matches what guests see.
  const effective = {
    logoUrl: state.logoUrl ?? legacy.logoUrl,
    bannerImageUrl: state.bannerImageUrl,
    primaryColor: state.primaryColor ?? legacy.brandColor ?? "#6F9586",
    secondaryColor: state.secondaryColor ?? "#0B1722",
    accentColor: state.accentColor ?? "#D7FF3C",
    fontFamily: state.fontFamily ?? "Inter",
    welcomeMessage:
      state.welcomeMessage ?? legacy.guestWelcomeMessage ?? `Welcome to ${venueName}.`,
  };

  async function patch(delta: Partial<BrandingState>): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/v/${slug}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delta),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setState(prev => ({ ...prev, ...delta }));
      setSavedAt(Date.now());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {error ? (
          <div className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm text-coral">
            {error}
          </div>
        ) : null}

        <Card title="Logo">
          <ImageUpload
            kind="logo"
            slug={slug}
            url={state.logoUrl}
            onChange={url => patch({ logoUrl: url })}
            onError={setError}
          />
        </Card>

        <Card title="Banner image">
          <p className="mb-2 text-[11px] text-slate/55">
            Wide hero image shown at the top of the guest landing. Optional.
          </p>
          <ImageUpload
            kind="banner"
            slug={slug}
            url={state.bannerImageUrl}
            onChange={url => patch({ bannerImageUrl: url })}
            onError={setError}
          />
        </Card>

        <Card title="Colors">
          <ColorRow
            label="Primary"
            help="Main brand color. Used for headers + primary buttons in the guest UI."
            value={state.primaryColor}
            placeholder={legacy.brandColor ?? "#6F9586"}
            onSave={v => patch({ primaryColor: v })}
          />
          <ColorRow
            label="Secondary"
            help="Supporting color for body sections and secondary buttons."
            value={state.secondaryColor}
            placeholder="#0B1722"
            onSave={v => patch({ secondaryColor: v })}
          />
          <ColorRow
            label="Accent"
            help="Highlight color for badges, hover, and 'featured' callouts."
            value={state.accentColor}
            placeholder="#D7FF3C"
            onSave={v => patch({ accentColor: v })}
          />
        </Card>

        <Card title="Font">
          <FontRow
            value={state.fontFamily}
            onSave={v => patch({ fontFamily: v })}
          />
        </Card>

        <Card title="Welcome message">
          <p className="text-[11px] text-slate/55">
            Overrides the legacy Settings welcome line on the guest landing.
            Up to 240 characters. Leave blank to fall back to Settings.
          </p>
          <WelcomeRow
            value={state.welcomeMessage}
            placeholder={legacy.guestWelcomeMessage ?? `Welcome to ${venueName}.`}
            onSave={v => patch({ welcomeMessage: v })}
          />
        </Card>

        <p className="text-[11px] text-slate/45">
          {busy ? "Saving…" : savedAt ? `Last saved ${timeSince(savedAt)}` : "Changes save when you tap Save on a field."}
        </p>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-umber">Guest preview</p>
        <GuestPreview venueName={venueName} effective={effective} />
        <p className="mt-2 text-[10px] text-slate/45">
          Approximation. Guest screens may vary. Falls back to Settings values
          where Branding is empty.
        </p>
      </aside>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate/10 bg-white px-6 py-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-umber">{title}</p>
      <div className="mt-3 space-y-1.5">{children}</div>
    </section>
  );
}

function ColorRow({
  label,
  help,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  help: string;
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  // Re-sync local draft when parent value changes (e.g. after another
  // field successfully saves and the server response refreshes state).
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const valid = draft === "" || isHex(draft);
  const dirty = draft !== (value ?? "");

  async function save() {
    if (!valid || !dirty) return;
    setBusy(true);
    await onSave(draft === "" ? null : draft.toLowerCase());
    setBusy(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate/5 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate">{label}</p>
        <p className="text-[11px] text-slate/55">{help}</p>
      </div>
      <input
        type="color"
        value={isHex(draft) ? draft : (value && isHex(value) ? value : placeholder)}
        onChange={e => setDraft(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-slate/15 bg-white p-1"
        aria-label={`${label} color picker`}
      />
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={[
          "w-28 rounded border bg-white px-2 py-1.5 text-sm font-mono",
          valid ? "border-slate/15" : "border-coral",
        ].join(" ")}
      />
      <button
        type="button"
        onClick={save}
        disabled={!valid || !dirty || busy}
        className="rounded-lg bg-slate px-3 py-1.5 text-xs text-oat hover:bg-slate/90 disabled:opacity-40"
      >
        {busy ? "…" : "Save"}
      </button>
    </div>
  );
}

function FontRow({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const dirty = draft !== (value ?? "");
  const valid = draft.length <= 60;

  async function save() {
    if (!valid || !dirty) return;
    setBusy(true);
    await onSave(draft.trim() === "" ? null : draft.trim());
    setBusy(false);
  }

  return (
    <div className="space-y-2 py-2">
      <p className="text-[11px] text-slate/55">
        CSS font-family. Stick to system-safe stacks unless you load a webfont elsewhere.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {FONT_PRESETS.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setDraft(f)}
            className="rounded-full border border-slate/15 bg-white px-2.5 py-1 text-[11px] hover:border-slate/40"
            style={{ fontFamily: f }}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Inter"
          maxLength={60}
          className={[
            "flex-1 rounded border bg-white px-3 py-2 text-sm",
            valid ? "border-slate/15" : "border-coral",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={save}
          disabled={!valid || !dirty || busy}
          className="rounded-lg bg-slate px-3 py-2 text-xs text-oat hover:bg-slate/90 disabled:opacity-40"
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function WelcomeRow({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const dirty = draft !== (value ?? "");
  const valid = draft.length <= 240;

  async function save() {
    if (!valid || !dirty) return;
    setBusy(true);
    await onSave(draft.trim() === "" ? null : draft);
    setBusy(false);
  }

  return (
    <div className="space-y-2 py-2">
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={placeholder}
        maxLength={240}
        rows={3}
        className={[
          "w-full resize-y rounded border bg-white px-3 py-2 text-sm",
          valid ? "border-slate/15" : "border-coral",
        ].join(" ")}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate/45">{draft.length} / 240</span>
        <button
          type="button"
          onClick={save}
          disabled={!valid || !dirty || busy}
          className="rounded-lg bg-slate px-3 py-1.5 text-xs text-oat hover:bg-slate/90 disabled:opacity-40"
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function ImageUpload({
  kind,
  slug,
  url,
  onChange,
  onError,
}: {
  kind: "logo" | "banner";
  slug: string;
  url: string | null;
  onChange: (next: string | null) => Promise<boolean>;
  onError: (msg: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const previewClass =
    kind === "logo"
      ? "h-20 w-20 rounded-xl border border-slate/15 bg-white"
      : "h-24 w-full rounded-xl border border-slate/15 bg-white";

  async function upload(file: File) {
    onError(null);
    if (file.size === 0) {
      onError("File is empty.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB; max is 5 MB.`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/v/${slug}/branding/${kind}`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      const nextUrl = kind === "logo" ? body.logoUrl : body.bannerImageUrl;
      // The upload endpoint already upserted; mirror via PATCH so local
      // state + audit are consistent.
      await onChange(nextUrl);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void upload(f);
  }

  async function clear() {
    onError(null);
    setBusy(true);
    await onChange(null);
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate/55">{ACCEPT_LABEL}</p>
      <div className={["overflow-hidden", previewClass].join(" ")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Venue ${kind}`} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wider text-slate/40">
            no {kind}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          disabled={busy}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center rounded-lg border border-slate/15 bg-white px-3 py-1.5 text-sm text-slate hover:border-slate/40 disabled:opacity-60"
        >
          {busy ? "Uploading…" : url ? `Replace ${kind}` : "Choose file"}
        </button>
        {url ? (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-[12px] text-coral underline-offset-4 hover:underline disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GuestPreview({
  venueName,
  effective,
}: {
  venueName: string;
  effective: {
    logoUrl: string | null;
    bannerImageUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    fontFamily: string;
    welcomeMessage: string;
  };
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate/10 bg-white shadow-sm"
      style={{ fontFamily: effective.fontFamily }}
    >
      <div
        className="relative h-28 w-full"
        style={{
          backgroundColor: effective.primaryColor,
          backgroundImage: effective.bannerImageUrl ? `url(${effective.bannerImageUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {effective.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={effective.logoUrl}
            alt="logo"
            className="absolute bottom-[-22px] left-4 h-12 w-12 rounded-lg border-2 border-white bg-white object-contain shadow"
          />
        ) : null}
      </div>
      <div className="px-4 pb-4 pt-7">
        <p className="text-sm font-medium" style={{ color: effective.secondaryColor }}>{venueName}</p>
        <p className="mt-1 text-[12px] text-slate/65">{effective.welcomeMessage}</p>
        <button
          type="button"
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm font-medium"
          style={{
            // Inline override of the chartreuse default — replaces the
            // built-in CTA color with the venue's primary.
            backgroundColor: effective.primaryColor,
            color: contrastingText(effective.primaryColor),
          }}
        >
          Order now
        </button>
        <button
          type="button"
          className="mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium"
          style={{
            backgroundColor: effective.accentColor,
            color: contrastingText(effective.accentColor),
          }}
        >
          See features
        </button>
      </div>
    </div>
  );
}

// Pick black or white text based on the background lightness — keeps
// the preview readable when the manager picks a pastel or near-black.
function contrastingText(hex: string): string {
  const v = hex.replace("#", "");
  if (v.length !== 6) return "#0B1722";
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0B1722" : "#FAF6EE";
}

function timeSince(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}
