"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Google Business Profile card on venue Settings: connect → pick the
 * location → synced state (last sync, review count, sync now,
 * disconnect). Renders the not-configured state calmly when the
 * platform has no Google credentials yet (ships-dormant pattern).
 */

type Connection = {
  status: "PENDING" | "CONNECTED" | "DISCONNECTED" | "ERROR";
  googleEmail: string | null;
  locationTitle: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

type LocationOption = { accountName: string; locationName: string; title: string };

export function GbpCard({ slug }: { slug: string }) {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [reviewCount, setReviewCount] = useState(0);
  const [locations, setLocations] = useState<LocationOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/v/${slug}/gbp`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setConn(body.connection);
      setReviewCount(body.reviewCount ?? 0);
    } catch { /* transient */ }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  // Surface callback results (?gbp=connected / ?gbp_error=...) once.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const err = sp.get("gbp_error");
    if (err) setError(`Google connection failed (${err}). Try again.`);
  }, []);

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/gbp/connect`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the connection.");
    } finally {
      setBusy(null);
    }
  }

  async function loadLocations() {
    setBusy("locations");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/gbp/locations`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 502
            ? "Google refused the Business Profile API call — your Cloud project may still need GBP API access approval."
            : body?.detail ?? body?.error ?? `HTTP ${res.status}`,
        );
      }
      setLocations(body.locations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't list locations.");
    } finally {
      setBusy(null);
    }
  }

  async function bind(loc: LocationOption) {
    setBusy(loc.locationName);
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/gbp/location`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(loc),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLocations(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't bind the location.");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("sync");
    setError(null);
    try {
      const res = await fetch(`/api/admin/v/${slug}/gbp/sync`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Business Profile? Synced reviews stay; syncing stops.")) return;
    setBusy("disconnect");
    try {
      await fetch(`/api/admin/v/${slug}/gbp`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (notConfigured) {
    return (
      <p className="text-sm text-slate/55">
        Google integration isn&rsquo;t configured on this deployment yet. Once platform Google
        credentials exist, connect your Business Profile here to pull your Google reviews
        into TabCall.
      </p>
    );
  }

  const connected = conn?.status === "CONNECTED" || conn?.status === "ERROR";

  return (
    <div className="space-y-3">
      {conn === undefined ? (
        <p className="text-sm text-slate/45">Loading…</p>
      ) : !conn || conn.status === "DISCONNECTED" ? (
        <>
          <p className="text-sm text-slate/70">
            Pull your Google reviews into the TabCall inbox, reply from one place, and see
            per-location ratings. Connect with the Google account that manages your
            Business Profile.
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={busy === "connect"}
            className="rounded-full bg-slate px-4 py-2 text-sm font-medium text-oat hover:bg-slate/90 disabled:opacity-60"
          >
            {busy === "connect" ? "Starting…" : "Connect Google Business Profile"}
          </button>
        </>
      ) : conn.status === "PENDING" ? (
        <>
          <p className="text-sm text-slate/70">
            Connected as <span className="font-medium">{conn.googleEmail ?? "your Google account"}</span>.
            Pick which location this venue is:
          </p>
          {locations === null ? (
            <button
              type="button"
              onClick={loadLocations}
              disabled={busy === "locations"}
              className="rounded-full bg-slate px-4 py-2 text-sm font-medium text-oat hover:bg-slate/90 disabled:opacity-60"
            >
              {busy === "locations" ? "Loading locations…" : "Choose location"}
            </button>
          ) : locations.length === 0 ? (
            <p className="text-sm text-slate/55">No locations visible on that account.</p>
          ) : (
            <ul className="space-y-2">
              {locations.map(loc => (
                <li key={loc.locationName}>
                  <button
                    type="button"
                    onClick={() => bind(loc)}
                    disabled={busy === loc.locationName}
                    className="w-full rounded-xl border border-slate/15 bg-white px-4 py-2.5 text-left text-sm hover:border-slate/35 disabled:opacity-60"
                  >
                    {busy === loc.locationName ? "Binding…" : loc.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : connected ? (
        <>
          <p className="text-sm text-slate/70">
            <span className="font-medium">{conn.locationTitle ?? "Location"}</span> ·{" "}
            {conn.googleEmail ?? ""}
          </p>
          <p className="text-[12px] text-slate/50">
            {reviewCount} review{reviewCount === 1 ? "" : "s"} synced · last sync{" "}
            {conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : "pending"}
            {conn.status === "ERROR" && conn.lastError ? (
              <span className="text-coral"> · {conn.lastError}</span>
            ) : null}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={busy === "sync"}
              className="rounded-full border border-slate/20 px-4 py-1.5 text-sm text-slate hover:border-slate/40 disabled:opacity-60"
            >
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              disabled={busy === "disconnect"}
              className="rounded-full border border-coral/30 px-4 py-1.5 text-sm text-coral hover:bg-coral/10 disabled:opacity-60"
            >
              Disconnect
            </button>
          </div>
        </>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-coral/15 px-3 py-2 text-sm text-coral" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
