import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";
import { BroadcastPanel } from "./broadcast-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — broadcast" };

export default async function OrgBroadcastPage({ params }: { params: { orgId: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/operator/orgs/${params.orgId}/broadcast`);
  const access = await checkOrgAccess(session, params.orgId);
  if (!access.ok) redirect("/operator");

  const allowed = canBroadcast(access.role);

  const org = await db.organization.findUnique({
    where: { id: params.orgId },
    select: { name: true, _count: { select: { venues: true } } },
  });
  if (!org) redirect("/operator");

  return (
    <>
      <header className="mb-6">
        <Link href={`/operator/orgs/${params.orgId}`} className="text-[12px] text-umber hover:underline">
          ← back to org
        </Link>
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-umber">Notice</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Broadcast to {org.name}</h1>
        <p className="mt-2 max-w-md text-sm text-slate/60">
          Send a manager notice that fans out to all {org._count.venues} venue{org._count.venues === 1 ? "" : "s"}.
          Use for new SOPs, weather closures, system maintenance windows.
        </p>
      </header>

      {allowed ? (
        <BroadcastPanel orgId={params.orgId} venueCount={org._count.venues} />
      ) : (
        <section className="rounded-2xl border border-slate/15 bg-white p-5">
          <p className="text-sm text-slate/65">
            Broadcasting requires <strong>OWNER</strong> or <strong>ADMIN</strong> role on this org.
            You&rsquo;re a <span className="font-mono text-[12px]">{access.role}</span> here — read-only.
          </p>
        </section>
      )}
    </>
  );
}
