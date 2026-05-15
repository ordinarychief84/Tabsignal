"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "error" | "saved";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // Client-side gate. The server enforces the same thing; this just
  // saves a network round-trip and gives a fast inline hint.
  const newMismatch = confirm.length > 0 && newPassword !== confirm;
  const tooShort = newPassword.length > 0 && newPassword.length < 12;
  const sameAsCurrent =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    currentPassword === newPassword;

  const canSubmit =
    status !== "submitting" &&
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    confirm.length > 0 &&
    !newMismatch &&
    !sameAsCurrent;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/admin/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        const detail = body?.error === "INVALID_CURRENT_PASSWORD"
          ? "Current password is wrong."
          : "Your session has expired. Sign in again.";
        setStatus("error");
        setError(detail);
        return;
      }
      if (res.status === 429) {
        setStatus("error");
        setError("Too many attempts. Try again in an hour.");
        return;
      }
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        const detail = body?.error === "SAME_PASSWORD"
          ? "Pick a password you haven't used before."
          : body?.detail || "Password doesn't meet requirements (12-128 chars).";
        setStatus("error");
        setError(detail);
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setError(`Save failed (HTTP ${res.status}).`);
        return;
      }
      setStatus("saved");
      // Cookie was cleared in the response. Send the admin back to
      // sign-in with the new password.
      setTimeout(() => {
        window.location.href = "/admin/login?changed=1";
      }, 1200);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Network error");
    }
  }

  if (status === "saved") {
    return (
      <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-4" role="status" aria-live="polite">
        <p className="text-sm font-medium text-slate">Password updated.</p>
        <p className="mt-1 text-xs text-slate/65">
          Sending you to sign in with the new password…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        id="current"
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <div>
        <Field
          id="new"
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
        />
        {tooShort ? (
          <p className="mt-1 text-[11px] text-umber">At least 12 characters.</p>
        ) : null}
        {sameAsCurrent ? (
          <p className="mt-1 text-[11px] text-umber">New password must differ from current.</p>
        ) : null}
      </div>
      <div>
        <Field
          id="confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {newMismatch ? (
          <p className="mt-1 text-[11px] text-umber">Doesn&rsquo;t match.</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-coral" role="alert">{error}</p> : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl bg-chartreuse py-3 text-base font-medium text-slate shadow-soft disabled:opacity-60"
      >
        {status === "submitting" ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] uppercase tracking-[0.18em] text-umber">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        value={value}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-umber-soft/40 bg-white px-4 py-3 text-base text-slate placeholder-slate/35 outline-none focus:border-sea focus:ring-1 focus:ring-sea"
      />
    </div>
  );
}
