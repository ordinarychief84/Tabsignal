"use client";

import { useRef, useState } from "react";
import { defaultWelcome } from "@/lib/welcome-text";

/**
 * How a server appears to the table.
 *
 * Three fields, because three is what a guest sees. Everything else on
 * a staff record — venue, role, permissions, table assignments — belongs
 * to whoever manages the floor, and this page doesn't pretend otherwise:
 * those are shown as read-only facts with a line saying who to ask.
 *
 * The preview is the point. A server writing a welcome message is
 * writing something that appears on a stranger's phone, and asking them
 * to imagine that is how you get messages that read fine in a form and
 * badly at a table. So the form shows the actual sentence, live, in the
 * shape the guest gets it.
 */

type Profile = {
  name: string;
  displayName: string | null;
  photoUrl: string | null;
  welcomeMessage: string | null;
  section: string | null;
  role: string;
  venueName: string;
  venueWelcomeMessage: string | null;
};

export function ProfileForm({ initial }: { initial: Profile }) {
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [welcome, setWelcome] = useState(initial.welcomeMessage ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // What a guest actually reads, right now. Falls through the same chain
  // the guest app uses: this server's message, then the venue's, then a
  // sentence TabCall writes.
  const firstName = (displayName.trim() || initial.name).split(/\s+/)[0] ?? "";
  const previewMessage =
    welcome.trim() ||
    initial.venueWelcomeMessage?.trim() ||
    defaultWelcome(firstName, initial.venueName);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/staff/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          welcomeMessage: welcome.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/staff/profile", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? "Couldn't upload that photo");
      setPhotoUrl(body.photoUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------ photo ----------------------------- */}
      <section className="rounded-2xl border border-sandstone bg-surface p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
          Your photo
        </h2>
        <div className="mt-3 flex items-center gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-apricot to-saffron text-[22px] font-semibold text-plum"
            >
              {(firstName || "?").charAt(0).toUpperCase()}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              id="staff-photo"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <label
              htmlFor="staff-photo"
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-sandstone bg-surface-muted px-4 text-[14px] font-medium text-plum hover:bg-surface-hover"
            >
              {uploading ? "Uploading…" : photoUrl ? "Change photo" : "Add a photo"}
            </label>
            <p className="mt-1.5 text-[12px] leading-relaxed text-graphite">
              Guests see this when they sit down. Optional — without one they
              get a letter in your venue&rsquo;s colours.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------- name ----------------------------- */}
      <section className="rounded-2xl border border-sandstone bg-surface p-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
            The name you go by
          </span>
          <input
            type="text"
            maxLength={40}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder={initial.name.split(/\s+/)[0] ?? ""}
            className="mt-1.5 min-h-[48px] w-full rounded-xl border border-sandstone bg-surface px-3.5 text-[15px] text-plum outline-none focus:border-saffron-deep focus:ring-2 focus:ring-saffron/30"
          />
          {/* The distinction that matters: the record has their legal
              name; this is what a stranger's phone shows. */}
          <span className="mt-1.5 block text-[12px] leading-relaxed text-graphite">
            This is what guests see. Your account is under{" "}
            <span className="font-medium text-plum">{initial.name}</span>, and only
            your manager can change that.
          </span>
        </label>
      </section>

      {/* ----------------------------- welcome ---------------------------- */}
      <section className="rounded-2xl border border-sandstone bg-surface p-4">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
            Your welcome
          </span>
          <textarea
            rows={3}
            maxLength={400}
            value={welcome}
            onChange={e => setWelcome(e.target.value)}
            placeholder="Leave it empty and your venue's message is used."
            className="mt-1.5 w-full rounded-xl border border-sandstone bg-surface p-3.5 text-[15px] leading-relaxed text-plum outline-none focus:border-saffron-deep focus:ring-2 focus:ring-saffron/30"
          />
          <span className="mt-1.5 block text-[12px] leading-relaxed text-graphite">
            Your manager can see and change this, same as they can your name and
            photo.
          </span>
        </label>

        {/* The preview. A server writing this is writing something that
            lands on a stranger's phone; asking them to imagine it is how
            you get messages that read fine in a form and badly at a
            table. */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
            What the table reads
          </p>
          <div className="mt-2 rounded-2xl border border-sandstone bg-ivory p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite">
              Meet
            </p>
            <p className="text-[20px] font-semibold leading-tight tracking-tight text-plum">
              {firstName || "Your name"}
            </p>
            <p className="text-[13px] text-graphite">Your server tonight</p>
            <p className="mt-3 text-[15px] leading-relaxed text-graphite">
              {previewMessage}
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------- read-only --------------------------- */}
      <section className="rounded-2xl border border-sandstone bg-surface-muted p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-graphite">
          Set by your venue
        </h2>
        <dl className="mt-2.5 space-y-1.5 text-[13px]">
          <Row label="Venue" value={initial.venueName} />
          <Row label="Role" value={initial.role.toLowerCase()} />
          <Row label="Section" value={initial.section ?? "Not set"} />
        </dl>
        <p className="mt-2.5 text-[12px] leading-relaxed text-graphite">
          These, and which tables you cover, are your manager&rsquo;s to change.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-clay/40 bg-clay-soft px-3.5 py-3 text-[13px] text-clay-deep">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="min-h-[52px] flex-1 rounded-2xl bg-saffron text-[15px] font-semibold text-plum disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span role="status" className="text-[13px] font-medium text-mint-deep">
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-graphite">{label}</dt>
      <dd className="font-medium text-plum">{value}</dd>
    </div>
  );
}
