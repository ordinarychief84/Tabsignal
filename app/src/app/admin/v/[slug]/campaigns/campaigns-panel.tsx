"use client";

import { useState } from "react";
import { Panel, Badge, EmptyState } from "@/components/admin/ui";

/**
 * Compose a campaign and see who it would reach.
 *
 * The audience counts are real: they come from consent records, so a
 * venue with 300 guests and 12 opt-ins sees 12. That number being small
 * and honest is more useful than a big one that would land the venue in
 * front of a regulator.
 */

const AUDIENCE_LABELS: Record<string, string> = {
  ALL_SUBSCRIBED: "Everyone opted in",
  VISITED_LAST_30_DAYS: "Visited in the last 30 days",
  RETURNING_GUESTS: "Returning guests",
};

type Campaign = {
  id: string;
  name: string;
  message: string;
  audienceType: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
};

export function CampaignsPanel({
  slug,
  venueName,
  messagingConfigured,
  audiences,
  campaigns: initial,
}: {
  slug: string;
  venueName: string;
  messagingConfigured: boolean;
  audiences: { audience: string; count: number }[];
  campaigns: Campaign[];
}) {
  const [campaigns, setCampaigns] = useState(initial);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("ALL_SUBSCRIBED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const selected = audiences.find(a => a.audience === audience);

  async function create() {
    if (busy || !name.trim() || !message.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), message: message.trim(), audienceType: audience }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setCampaigns(curr => [
        {
          id: body.campaign.id,
          name: body.campaign.name,
          message: message.trim(),
          audienceType: audience,
          status: body.campaign.status,
          scheduledAt: null,
          sentAt: null,
          recipients: body.eligible ?? 0,
        },
        ...curr,
      ]);
      setName("");
      setMessage("");
      if (body.note) setNote(body.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Panel title="New campaign">
        {!messagingConfigured ? (
          // Said once, plainly, before they write anything.
          <div className="mb-4 rounded-xl border border-umber-soft/40 bg-oat px-3.5 py-3">
            <p className="text-[13px] font-medium text-slate">No messaging provider connected</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate/65">
              You can write and save campaigns, and see exactly who they&rsquo;d reach.
              Nothing will be sent until an SMS provider is configured.
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={120}
            placeholder="Friday jazz night"
            className="mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 bg-white px-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
          />
        </label>

        <label className="mt-4 block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Message</span>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder={`Thanks for visiting ${venueName} — we've got something on this Friday.`}
            className="mt-1.5 w-full rounded-xl border border-umber-soft/40 bg-white p-3.5 text-sm outline-none focus:border-sea focus:ring-2 focus:ring-sea/25"
          />
          <span className="mt-1 block text-[11px] text-slate/45">{message.length}/1000</span>
        </label>

        <label className="mt-4 block">
          <span className="text-[11px] uppercase tracking-[0.16em] text-umber">Audience</span>
          <select
            value={audience}
            onChange={e => setAudience(e.target.value)}
            className="mt-1.5 min-h-[44px] w-full rounded-xl border border-umber-soft/40 bg-white px-3 text-sm"
          >
            {audiences.map(a => (
              <option key={a.audience} value={a.audience}>
                {AUDIENCE_LABELS[a.audience] ?? a.audience} · {a.count}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-2 text-[12px] leading-relaxed text-slate/55">
          {selected?.count === 0
            ? "Nobody has opted in yet, so this would reach no one."
            : `This would reach ${selected?.count} guest${selected?.count === 1 ? "" : "s"} who opted in.`}
        </p>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="mt-3 rounded-lg bg-sea-soft/40 px-3 py-2 text-[12px] text-slate">
            {note}
          </p>
        ) : null}

        <button
          type="button"
          onClick={create}
          disabled={busy || !name.trim() || !message.trim()}
          className="mt-4 min-h-[44px] w-full rounded-xl bg-slate text-sm font-medium text-oat disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save campaign"}
        </button>
      </Panel>

      <Panel title="Campaigns">
        {campaigns.length === 0 ? (
          <EmptyState title="Nothing yet" body="Saved campaigns show up here with the audience they reached." />
        ) : (
          <ul className="space-y-3">
            {campaigns.map(c => (
              <li key={c.id} className="rounded-2xl border border-umber-soft/25 p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate">{c.name}</p>
                  <Badge tone={c.status === "SENT" ? "green" : c.status === "FAILED" ? "coral" : "neutral"}>
                    {c.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate/70">{c.message}</p>
                <p className="mt-2 text-[12px] text-slate/50">
                  {AUDIENCE_LABELS[c.audienceType] ?? c.audienceType} · {c.recipients} eligible
                  {c.sentAt ? ` · sent ${new Date(c.sentAt).toLocaleDateString()}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
