import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess, listAccessibleOrgs } from "@/lib/operator-rbac";

export const dynamic = "force-dynamic";

export default async function OperatorOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { orgId: string };
}) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/operator/orgs/${params.orgId}`);

  const access = await checkOrgAccess(session, params.orgId);
  if (!access.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-oat px-6 text-center">
        <div className="max-w-sm">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium text-slate">No access to this org.</h1>
          <p className="mt-3 text-sm text-slate/60">
            You&rsquo;re signed in as <span className="font-mono text-[12px]">{session.email}</span> but
            don&rsquo;t have a membership row for this organization.
          </p>
          <Link
            href="/operator"
            className="mt-6 inline-block rounded-lg border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate hover:text-oat"
          >
            ← back to operator console
          </Link>
        </div>
      </main>
    );
  }

  const orgs = await listAccessibleOrgs(session);
  const showSwitcher = orgs.length > 1;

  return (
    <div className="flex min-h-screen flex-col bg-oat text-slate md:flex-row">
      <aside className="border-b border-slate/10 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="px-6 py-5">
          <Link href="/operator" className="inline-flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M 6 11 Q 12 6, 18 11" fill="none" stroke="#F2E7B7" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="16" r="2" fill="#F2E7B7" />
              </svg>
            </span>
            <span className="text-lg font-medium tracking-tight text-slate">TabCall</span>
            <span className="ml-2 rounded-full bg-sea/40 px-2 py-0.5 text-[10px] font-medium text-slate">
              operator
            </span>
          </Link>
          <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-umber">Org</p>
          <p className="mt-1 truncate text-sm font-medium">
            {orgs.find(o => o.id === params.orgId)?.name ?? params.orgId}
          </p>
          {showSwitcher ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-umber">switch org</summary>
              <ul className="mt-1 space-y-0.5">
                {orgs.filter(o => o.id !== params.orgId).map(o => (
                  <li key={o.id}>
                    <Link
                      href={`/operator/orgs/${o.id}`}
                      className="block truncate rounded px-2 py-1 text-[11px] text-slate/70 hover:bg-slate/5 hover:text-slate"
                    >
                      {o.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
        <nav className="px-3 py-2">
          <ul className="space-y-0.5">
            <NavLink href={`/operator/orgs/${params.orgId}`} label="Overview" />
            <NavLink href={`/operator/orgs/${params.orgId}/venues`} label="Venues" />
            <NavLink href={`/operator/orgs/${params.orgId}/billing`} label="Plan" />
            <NavLink href={`/operator/orgs/${params.orgId}/members`} label="Members" />
            <NavLink href={`/operator/orgs/${params.orgId}/broadcast`} label="Broadcast" />
          </ul>
        </nav>
        <div className="px-6 py-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-umber">Role</p>
          <p className="mt-1 font-mono text-[11px] text-slate/60">{access.role}</p>
        </div>
      </aside>
      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-lg px-3 py-2 text-sm text-slate/70 hover:bg-slate/5 hover:text-slate"
      >
        {label}
      </Link>
    </li>
  );
}
