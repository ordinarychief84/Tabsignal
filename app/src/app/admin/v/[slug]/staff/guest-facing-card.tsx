"use client";

import { useRef, useState } from "react";

/**
 * How one member of staff is introduced to guests.
 *
 * These three fields shipped with the schema and had no way to be set, so
 * every table that had a server assigned still greeted guests with a
 * generic message. The preview below is the point of the card: a manager
 * writing a greeting should see the thing the guest sees, not imagine it.
 *
 * The fallback chain is shown honestly. Leaving the message empty is a
 * legitimate choice — the venue default takes over — so the preview says
 * which one is in play rather than pretending the box is required.
 */

export function GuestFacingCard({
  staffId,
  legalName,
  venueName,
  venueDefaultWelcome,
  initial,
  canEdit,
  onSaved,
}: {
  staffId: string;
  /** The internal name. Never shown to guests. */
  legalName: string;
  venueName: string;
  /** The venue-wide greeting, if the owner has written one. */
  venueDefaultWelcome: string | null;
  initial: { displayName: string | null; photoUrl: string | null; welcomeMessage: string | null };
  canEdit: boolean;
  onSaved: (next: { displayName: string | null; photoUrl: string | null; welcomeMessage: string | null }) => void;
}) {
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(initial.welcomeMessage ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Exactly what lib/server-identity resolves to, mirrored here so the
  // preview can't drift from what a guest is actually shown.
  const shownName = firstNameOf(displayName.trim() || legalName);
  const effectiveWelcome =
    welcomeMessage.trim() ||
    venueDefaultWelcome?.trim() ||
    `Hi, I'm ${shownName}. Welcome to ${venueName}. I'll be with you shortly. ` +
      `Feel free to explore tonight's menu and specials while I make my way over.`;
  const source = welcomeMessage.trim()
    ? "their own message"
    : venueDefaultWelcome?.trim()
      ? "your venue default"
      : "TabCall's default";

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/staff/${staffId}/photo`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setPhotoUrl(body.url);
      onSaved({ displayName: initial.displayName, photoUrl: body.url, welcomeMessage: initial.welcomeMessage });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        displayName: displayName.trim() || null,
        welcomeMessage: welcomeMessage.trim() || null,
      };
      const res = await fetch(`/api/admin/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      onSaved({ ...payload, photoUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-umber-soft/30 bg-oat/40 p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">How guests see them</p>
      <p className="mt-1 text-[12px] leading-relaxed text-slate/55">
        Shown on the welcome screen at any table they&rsquo;re assigned to.
        Guests never see a surname, an email or a role.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-1 ring-umber-soft/40" />
            ) : (
              <span
                aria-hidden
                className="flex h-14 w-14 items-center justify-center rounded-full bg-chartreuse text-lg font-semibold text-slate"
              >
                {shownName.charAt(0).toUpperCase()}
              </span>
            )}
            {canEdit ? (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="min-h-[36px] rounded-lg border border-slate/20 px-3 text-[13px] text-slate hover:bg-slate/5 disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : photoUrl ? "Replace photo" : "Add photo"}
                </button>
                <p className="mt-1 text-[11px] text-slate/45">Optional. Saves immediately.</p>
              </div>
            ) : null}
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Goes by</span>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              disabled={!canEdit}
              maxLength={40}
              placeholder={firstNameOf(legalName)}
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-slate/45">
              First name only. Empty uses &ldquo;{firstNameOf(legalName)}&rdquo;.
            </span>
          </label>

          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Their greeting</span>
            <textarea
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              disabled={!canEdit}
              maxLength={400}
              rows={3}
              placeholder="Leave empty to use the venue's"
              className={inputClass}
            />
          </label>
        </div>

        {/* The preview is the reason this card exists. */}
        <div>
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Guest sees</span>
          <div className="mt-1.5 rounded-2xl bg-white p-4 ring-1 ring-umber-soft/30">
            <div className="flex items-center gap-3">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-chartreuse text-base font-semibold text-slate"
                >
                  {shownName.charAt(0).toUpperCase()}
                </span>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-umber">Meet</p>
                <p className="text-lg font-semibold leading-tight tracking-tight text-slate">
                  {shownName}
                </p>
                <p className="text-[11px] text-slate/55">Your server tonight</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-slate/75">{effectiveWelcome}</p>
          </div>
          <p className="mt-1.5 text-[11px] text-slate/45">Using {source}.</p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-[12px] text-coral">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="min-h-[38px] rounded-lg bg-slate px-4 text-[13px] font-medium text-oat disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {saved ? <span role="status" className="text-[12px] text-slate/55">Saved.</span> : null}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-slate/50">
          Your role can&rsquo;t change this. A manager or the person themselves can.
        </p>
      )}
    </div>
  );
}

const inputClass =
  "mt-1.5 min-h-[40px] w-full rounded-lg border border-umber-soft/40 bg-white px-3 py-2 text-[13px] text-slate outline-none focus:border-sea focus:ring-2 focus:ring-sea/25 disabled:bg-slate/5 disabled:text-slate/50";

/** Mirrors lib/server-identity: a surname must never reach a guest. */
function firstNameOf(value: string): string {
  return value.trim().split(/\s+/)[0] ?? value.trim();
}
