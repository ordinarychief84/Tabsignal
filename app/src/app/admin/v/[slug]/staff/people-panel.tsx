"use client";

import { useMemo, useState } from "react";

type Table = { id: string; label: string; zone: string | null };

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  ackedCount: number;
  lastSeenAt: string | null;
  invitedAt: string;
  invitedBy: { name: string; email: string } | null;
  tableIds: string[];
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SERVER: "Server",
  HOST: "Host",
  VIEWER: "Viewer",
  STAFF: "Staff",
  PLATFORM: "TabCall",
};

const ROLE_TONE: Record<string, string> = {
  OWNER: "bg-chartreuse/40 text-slate",
  MANAGER: "bg-sea/30 text-slate",
  SERVER: "bg-slate/10 text-slate",
  HOST: "bg-umber/20 text-slate",
  VIEWER: "bg-slate/5 text-slate/70",
  STAFF: "bg-slate/5 text-slate/70",
};

const STATUS_TONE: Record<Member["status"], string> = {
  ACTIVE: "bg-chartreuse/30 text-slate",
  INVITED: "bg-sea/20 text-slate",
  SUSPENDED: "bg-coral/15 text-coral",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function PeoplePanel(props: {
  initial: Member[];
  tables: Table[];
  currentEmail: string;
  currentRole: string;
  currentStaffId: string;
  assignableRoles: string[];
}) {
  const [items, setItems] = useState<Member[]>(props.initial);
  const [error, setError] = useState<string | null>(null);
  const [editingTablesFor, setEditingTablesFor] = useState<string | null>(null);
  const canInvite = props.assignableRoles.length > 0;
  const isManagerTier = props.currentRole === "OWNER" || props.currentRole === "MANAGER" || props.currentRole === "PLATFORM" || props.currentRole === "STAFF";
  const canRemove = props.currentRole === "OWNER" || props.currentRole === "PLATFORM" || props.currentRole === "STAFF";

  const grouped = useMemo(() => {
    return {
      active: items.filter(i => i.status === "ACTIVE"),
      invited: items.filter(i => i.status === "INVITED"),
      suspended: items.filter(i => i.status === "SUSPENDED"),
    };
  }, [items]);

  function patch(staffId: string, body: Record<string, unknown>) {
    return fetch(`/api/admin/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function changeRole(m: Member, newRole: string) {
    if (m.role === newRole) return;
    const prev = items;
    setItems(items.map(i => (i.id === m.id ? { ...i, role: newRole } : i)));
    setError(null);
    try {
      const res = await patch(m.id, { role: newRole });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Could not change role");
    }
  }

  async function setStatus(m: Member, status: "ACTIVE" | "SUSPENDED") {
    if (m.status === status) return;
    const prev = items;
    setItems(items.map(i => (i.id === m.id ? { ...i, status } : i)));
    setError(null);
    try {
      const res = await patch(m.id, { status });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Could not change status");
    }
  }

  async function remove(m: Member) {
    if (!window.confirm(`Remove ${m.name} from your venue? This wipes their account row. Suspend instead if you might want them back.`)) return;
    const prev = items;
    setItems(items.filter(i => i.id !== m.id));
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Could not remove");
    }
  }

  async function resendInvite(m: Member) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff/${m.id}/resend-invite`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      setError(body.delivered ? `Re-sent invite to ${m.email}.` : `Invite queued — email send failed, contact support.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend invite");
    }
  }

  async function saveAssignment(staffId: string, tableIds: string[]) {
    const prev = items;
    setItems(items.map(m => (m.id === staffId ? { ...m, tableIds } : m)));
    try {
      const res = await fetch(`/api/admin/staff/${staffId}/tables`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableIds }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : "Could not save assignment");
    }
  }

  return (
    <div className="space-y-8">
      {canInvite ? (
        <InviteCard assignableRoles={props.assignableRoles} onInvited={m => setItems([...items, m])} onError={setError} />
      ) : (
        <p className="rounded-2xl border border-slate/10 bg-white px-6 py-4 text-sm text-slate/55">
          Your role can&rsquo;t invite staff. Ask an Owner or Manager.
        </p>
      )}

      {error ? (
        <p
          className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-2.5 text-sm text-coral"
          role="status"
          aria-live="polite"
        >
          {error}
        </p>
      ) : null}

      <Section
        title="Pending invites"
        count={grouped.invited.length}
        empty="No outstanding invites."
        muted
      >
        {grouped.invited.map(m => (
          <Row
            key={m.id}
            m={m}
            tables={props.tables}
            isSelf={m.email === props.currentEmail}
            isEditingTables={editingTablesFor === m.id}
            assignableRoles={props.assignableRoles}
            isManagerTier={isManagerTier}
            canRemove={canRemove}
            onChangeRole={changeRole}
            onSetStatus={setStatus}
            onRemove={remove}
            onResendInvite={resendInvite}
            onToggleTables={() => setEditingTablesFor(editingTablesFor === m.id ? null : m.id)}
            onSaveAssignment={saveAssignment}
            showResendInvite
          />
        ))}
      </Section>

      <Section
        title="Active team"
        count={grouped.active.length}
        empty="No active members yet."
      >
        {grouped.active.map(m => (
          <Row
            key={m.id}
            m={m}
            tables={props.tables}
            isSelf={m.email === props.currentEmail}
            isEditingTables={editingTablesFor === m.id}
            assignableRoles={props.assignableRoles}
            isManagerTier={isManagerTier}
            canRemove={canRemove}
            onChangeRole={changeRole}
            onSetStatus={setStatus}
            onRemove={remove}
            onResendInvite={resendInvite}
            onToggleTables={() => setEditingTablesFor(editingTablesFor === m.id ? null : m.id)}
            onSaveAssignment={saveAssignment}
          />
        ))}
      </Section>

      {grouped.suspended.length > 0 ? (
        <Section
          title="Suspended"
          count={grouped.suspended.length}
          empty=""
          muted
        >
          {grouped.suspended.map(m => (
            <Row
              key={m.id}
              m={m}
              tables={props.tables}
              isSelf={m.email === props.currentEmail}
              isEditingTables={false}
              assignableRoles={props.assignableRoles}
              isManagerTier={isManagerTier}
              canRemove={canRemove}
              onChangeRole={changeRole}
              onSetStatus={setStatus}
              onRemove={remove}
              onResendInvite={resendInvite}
              onToggleTables={() => undefined}
              onSaveAssignment={saveAssignment}
            />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, count, empty, muted = false, children }: {
  title: string; count: number; empty: string; muted?: boolean; children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex items-end justify-between">
        <h2 className={`text-lg font-medium ${muted ? "text-slate/65" : ""}`}>{title}</h2>
        <p className="text-[11px] tracking-wide text-slate/40">
          {count} {count === 1 ? "member" : "members"}
        </p>
      </header>
      {count === 0 ? (
        empty ? (
          <div className="rounded-2xl border border-slate/10 bg-white px-6 py-8 text-center text-sm text-slate/55">
            {empty}
          </div>
        ) : null
      ) : (
        <ul className="space-y-3">{children}</ul>
      )}
    </section>
  );
}

function InviteCard({ assignableRoles, onInvited, onError }: {
  assignableRoles: string[];
  onInvited: (m: Member) => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(assignableRoles[0] ?? "SERVER");
  const [busy, setBusy] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError(null);
    setDevLink(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, send: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.error ?? `HTTP ${res.status}`);
      onInvited({
        id: body.id,
        name: body.name,
        email: body.email,
        role: body.role,
        status: body.status,
        ackedCount: 0,
        lastSeenAt: null,
        invitedAt: new Date().toISOString(),
        invitedBy: null,
        tableIds: [],
      });
      if (body.devLink) setDevLink(body.devLink);
      setName("");
      setEmail("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate/10 bg-white px-6 py-6">
      <p className="text-[11px] uppercase tracking-[0.16em] text-umber">Invite a teammate</p>
      <p className="mt-1 text-sm text-slate/55">
        They&rsquo;ll get a magic-link sign-in by email. No passwords, no app to install.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-5 grid gap-3 sm:grid-cols-[1fr,1fr,auto,auto]"
      >
        <input
          type="text"
          required
          placeholder="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
        />
        <input
          type="email"
          required
          inputMode="email"
          placeholder="email@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate placeholder-slate/35 focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="rounded-xl border border-slate/15 bg-white px-4 py-3 text-sm text-slate focus:border-sea focus:outline-none focus:ring-1 focus:ring-sea"
        >
          {assignableRoles.map(r => (
            <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-chartreuse px-5 py-3 text-sm font-medium text-slate disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </form>

      {devLink ? (
        <p className="mt-3 rounded-lg bg-chartreuse/15 px-3 py-2 text-[11px] text-slate/70">
          <span className="uppercase tracking-wider">Dev link:</span>{" "}
          <a className="break-all underline" href={devLink}>{devLink}</a>
        </p>
      ) : null}
    </section>
  );
}

function Row(props: {
  m: Member;
  tables: Table[];
  isSelf: boolean;
  isEditingTables: boolean;
  assignableRoles: string[];
  isManagerTier: boolean;
  canRemove: boolean;
  showResendInvite?: boolean;
  onChangeRole: (m: Member, role: string) => void;
  onSetStatus: (m: Member, status: "ACTIVE" | "SUSPENDED") => void;
  onRemove: (m: Member) => void;
  onResendInvite: (m: Member) => void;
  onToggleTables: () => void;
  onSaveAssignment: (id: string, tableIds: string[]) => void;
}) {
  const { m } = props;
  const roleSelectable = props.isManagerTier && !props.isSelf && m.status !== "SUSPENDED";

  return (
    <li className="rounded-2xl border border-slate/10 bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate/10 text-[12px] font-semibold text-slate/70"
          >
            {initials(m.name)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium text-slate">
              <span className="truncate">{m.name}</span>
              {props.isSelf ? (
                <span className="rounded-full bg-chartreuse/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate/70">
                  you
                </span>
              ) : null}
            </p>
            <p className="truncate text-[12px] text-slate/55">{m.email}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          {/* Role: select if caller can change, chip otherwise */}
          {roleSelectable && props.assignableRoles.length > 0 ? (
            <select
              value={m.role}
              onChange={e => props.onChangeRole(m, e.target.value)}
              className={`rounded-full border-0 px-3 py-1 pr-7 text-[11px] font-semibold ${ROLE_TONE[m.role] ?? ROLE_TONE.SERVER} cursor-pointer focus:outline-none focus:ring-1 focus:ring-slate/30`}
              aria-label={`Role for ${m.name}`}
            >
              {/* Always show the current role so the select renders even
                  if the caller can't *assign* it (e.g. Manager looking at
                  another Manager — they can read but not change). */}
              {[m.role, ...props.assignableRoles.filter(r => r !== m.role)].map(r => (
                <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
              ))}
            </select>
          ) : (
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${ROLE_TONE[m.role] ?? ROLE_TONE.SERVER}`}>
              {ROLE_LABEL[m.role] ?? m.role}
            </span>
          )}

          {/* Status chip */}
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${STATUS_TONE[m.status]}`}>
            {m.status}
          </span>

          {/* Last seen */}
          <div className="hidden text-right md:block">
            <p className="text-[11px] text-slate/55">
              {m.status === "INVITED"
                ? `Invited ${relativeTime(m.invitedAt)}`
                : `Last seen ${relativeTime(m.lastSeenAt)}`}
            </p>
            {m.invitedBy ? (
              <p className="text-[10px] text-slate/40">by {m.invitedBy.name}</p>
            ) : null}
          </div>

          {/* Action menu */}
          <RowActions
            m={m}
            isSelf={props.isSelf}
            isManagerTier={props.isManagerTier}
            canRemove={props.canRemove}
            showResendInvite={!!props.showResendInvite || m.status === "INVITED"}
            onSetStatus={props.onSetStatus}
            onRemove={props.onRemove}
            onResendInvite={props.onResendInvite}
            onToggleTables={props.onToggleTables}
          />
        </div>
      </div>

      {/* Assigned-table chips for ACTIVE members */}
      {m.status === "ACTIVE" ? (
        <div className="border-t border-slate/5 px-5 py-2.5">
          {m.tableIds.length === 0 ? (
            <p className="text-[11px] text-slate/40">
              No tables assigned. Requests still surface in the live queue.
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate/60">
              <span className="text-slate/40">Covers:</span>
              {props.tables
                .filter(t => m.tableIds.includes(t.id))
                .map(t => (
                  <span
                    key={t.id}
                    className="rounded-full bg-sea/30 px-2 py-0.5 text-[11px] text-slate/80"
                  >
                    {t.label}
                  </span>
                ))}
            </p>
          )}
        </div>
      ) : null}

      {/* Inline table editor */}
      {props.isEditingTables ? (
        <div className="border-t border-slate/5 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.16em] text-umber">
            Assign tables to {m.name}
          </p>
          <p className="mt-1 text-[11px] text-slate/55">
            Selections save automatically. Multiple staff can cover the same table.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {props.tables.map(t => {
              const active = m.tableIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? m.tableIds.filter(id => id !== t.id)
                      : [...m.tableIds, t.id];
                    props.onSaveAssignment(m.id, next);
                  }}
                  className={[
                    "rounded-lg border px-2 py-2 text-[12px] transition-colors",
                    active
                      ? "border-slate bg-slate text-oat"
                      : "border-slate/15 bg-white text-slate/70 hover:border-slate/30",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => props.onSaveAssignment(m.id, props.tables.map(t => t.id))}
              className="text-[11px] text-umber underline-offset-4 hover:underline"
            >
              Assign all
            </button>
            <button
              type="button"
              onClick={() => props.onSaveAssignment(m.id, [])}
              className="text-[11px] text-umber underline-offset-4 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function RowActions({
  m,
  isSelf,
  isManagerTier,
  canRemove,
  showResendInvite,
  onSetStatus,
  onRemove,
  onResendInvite,
  onToggleTables,
}: {
  m: Member;
  isSelf: boolean;
  isManagerTier: boolean;
  canRemove: boolean;
  showResendInvite: boolean;
  onSetStatus: (m: Member, status: "ACTIVE" | "SUSPENDED") => void;
  onRemove: (m: Member) => void;
  onResendInvite: (m: Member) => void;
  onToggleTables: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="rounded-lg border border-slate/15 px-2 py-1 text-[11px] font-medium text-slate/70 hover:text-slate"
        aria-label={`Actions for ${m.name}`}
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-slate/10 bg-white py-1 text-[13px] shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {m.status === "ACTIVE" ? (
            <button
              type="button"
              onClick={() => { onToggleTables(); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-slate/80 hover:bg-slate/5"
            >
              Edit tables
            </button>
          ) : null}
          {showResendInvite && isManagerTier ? (
            <button
              type="button"
              onClick={() => { onResendInvite(m); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-slate/80 hover:bg-slate/5"
            >
              Resend invite
            </button>
          ) : null}
          {isManagerTier && m.status === "ACTIVE" && !isSelf ? (
            <button
              type="button"
              onClick={() => { onSetStatus(m, "SUSPENDED"); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-slate/80 hover:bg-slate/5"
            >
              Suspend
            </button>
          ) : null}
          {isManagerTier && m.status === "SUSPENDED" ? (
            <button
              type="button"
              onClick={() => { onSetStatus(m, "ACTIVE"); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-slate/80 hover:bg-slate/5"
            >
              Reactivate
            </button>
          ) : null}
          {canRemove && !isSelf ? (
            <button
              type="button"
              onClick={() => { onRemove(m); setOpen(false); }}
              className="block w-full border-t border-slate/5 px-3 py-2 text-left text-coral hover:bg-coral/5"
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
