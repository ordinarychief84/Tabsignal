import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { checkOrgAccess, listAccessibleOrgs } from "@/lib/operator-rbac";
import { OrgSectionNav } from "./section-nav";

export const dynamic = "force-dynamic";

/**
 * Section chrome for one organization inside the operator console.
 *
 * This used to render its own full-height sidebar — TabCall brand,
 * "operator" badge and all — which then rendered INSIDE the operator
 * AdminShell's sidebar. Two brands, two navs, and the actual content
 * squeezed into what was left. The shared SaaS shell landed for the
 * admin and venue consoles but this sub-layout was missed.
 *
 * A section is not an app: the parent shell keeps the identity and the
 * top-level nav, and this contributes a section header plus a row of
 * section tabs, the way the org pages read in every other console.
 */
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
      <div className="mx-auto max-w-sm py-16 text-center">
        <h1 className="text-2xl font-medium text-slate">No access to this org.</h1>
        <p className="mt-3 text-sm text-slate/60">
          You&rsquo;re signed in as <span className="font-mono text-[12px]">{session.email}</span> but
          don&rsquo;t have a membership row for this organization.
        </p>
        <Link
          href="/operator/orgs"
          className="mt-6 inline-block rounded-lg border border-slate/20 px-4 py-2 text-sm text-slate hover:bg-slate hover:text-oat"
        >
          ← back to organizations
        </Link>
      </div>
    );
  }

  const orgs = await listAccessibleOrgs(session);
  const current = orgs.find(o => o.id === params.orgId);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Organization</p>
          <h1 className="mt-1 truncate text-2xl font-medium tracking-tight text-slate">
            {current?.name ?? params.orgId}
          </h1>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate/45">
          your role · {access.role}
        </p>
      </div>

      <OrgSectionNav
        orgId={params.orgId}
        // Only worth offering when there's somewhere else to go.
        others={orgs.filter(o => o.id !== params.orgId).map(o => ({ id: o.id, name: o.name }))}
      />

      <div className="mt-8">{children}</div>
    </div>
  );
}
