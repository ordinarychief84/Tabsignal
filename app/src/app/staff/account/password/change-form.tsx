"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "error" | "saved";

export function StaffChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const tooShort = newPassword.length > 0 && newPassword.length < 12;
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const sameAsCurrent =
    hasPassword && currentPassword.length > 0 && newPassword.length > 0 && currentPassword === newPassword;
  const strength = scorePassword(newPassword);

  const canSubmit =
    status !== "submitting" &&
    newPassword.length >= 12 &&
    confirm.length > 0 &&
    !mismatch &&
    !sameAsCurrent &&
    (!hasPassword || currentPassword.length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(hasPassword ? { currentPassword } : {}),
          newPassword,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setStatus("error");
        setError(body?.error === "INVALID_CURRENT_PASSWORD" ? "Current password is wrong." : "Your session expired. Sign in again.");
        return;
      }
      if (res.status === 429) {
        setStatus("error");
        setError("Too many attempts. Try again in an hour.");
        return;
      }
      if (res.status === 400) {
        setStatus("error");
        setError(body?.error === "SAME_PASSWORD" ? "Pick a password you haven't used before." : body?.detail || "Password doesn't meet requirements.");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setError(`Save failed (HTTP ${res.status})`);
        return;
      }
      setStatus("saved");
      setTimeout(() => {
        window.location.href = "/login?changed=1";
      }, 1200);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Network error");
    }
  }

  if (status === "saved") {
    return (
      <div className="rounded-2xl border border-chartreuse/40 bg-chartreuse/15 p-4" role="status" aria-live="polite">
        <p className="text-sm font-medium text-slate">Password saved.</p>
        <p className="mt-1 text-xs text-slate/65">
          Sending you to sign in with the new password…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {hasPassword ? (
        <Field
          id="current"
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          autoComplete="current-password"
        />
      ) : null}

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="new" className="block text-[12px] font-medium text-slate/70">
            New password
          </label>
          <button
            type="button"
            onClick={() => setShowNew(s => !s)}
            className="text-[11px] text-slate/55 underline-offset-4 hover:underline"
          >
            {showNew ? "Hide" : "Show"}
          </button>
        </div>
        <input
          id="new"
          type={showNew ? "text" : "password"}
          required
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 text-[15px] text-slate placeholder-slate/35 outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
        />
        {newPassword.length > 0 ? (
          <div className="mt-2">
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate/10">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${strength.pct}%`,
                  backgroundColor: strength.color,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate/55">{strength.label}</p>
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-slate/55">At least 12 characters.</p>
        )}
        {tooShort ? <p className="mt-1 text-[11px] text-umber">A bit longer — 12 minimum.</p> : null}
        {sameAsCurrent ? <p className="mt-1 text-[11px] text-umber">Must differ from current.</p> : null}
      </div>

      <Field
        id="confirm"
        label="Confirm new password"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      {mismatch ? <p className="-mt-3 text-[11px] text-umber">Doesn&rsquo;t match.</p> : null}

      {error ? <p className="rounded-lg bg-coral/15 px-3 py-2 text-center text-sm text-coral" role="alert">{error}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-[48px] w-full rounded-xl bg-chartreuse text-[15px] font-semibold text-slate shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {status === "submitting" ? "Saving…" : hasPassword ? "Update password" : "Set password"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  type: "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium text-slate/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 block w-full rounded-xl border border-slate/15 bg-white px-3.5 py-3 text-[15px] text-slate outline-none transition-shadow focus:border-slate/40 focus:ring-4 focus:ring-slate/[0.08]"
      />
    </div>
  );
}

/** Tiny client-side strength estimate. Purely for UI feedback — server
 *  enforces 12–128 chars regardless of label. */
function scorePassword(pw: string): { pct: number; color: string; label: string } {
  if (pw.length === 0) return { pct: 0, color: "#E8B8B8", label: "" };
  const len = Math.min(pw.length / 18, 1);
  const variety =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/\d/.test(pw) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(pw) ? 1 : 0);
  const score = len * 0.55 + (variety / 4) * 0.45;
  if (score < 0.4) return { pct: Math.max(15, score * 100), color: "#E8B8B8", label: "Weak — add length or symbols" };
  if (score < 0.7) return { pct: score * 100, color: "#B7A39A", label: "OK — could be stronger" };
  return { pct: Math.min(100, score * 100), color: "#C7D6CF", label: "Strong" };
}
