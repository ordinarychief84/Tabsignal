import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getStaffSession } from "@/lib/auth/session";
import { canBroadcast, checkOrgAccess } from "@/lib/operator-rbac";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · org members" };

export default async function OrgMembersPage({ params }: { params: { orgId: string } }) {
  const session = await getStaffSession();
  if (!session) redirect(`/staff/login?next=/operator/orgs/${params.orgId}/members`);
  const access = await checkOrgAccess(session, params.orgId);
  if (!access.ok) redirect("/operator");

  const org = await db.organization.findUnique({
    where: { id: params.orgId },
    select: { name: true },
  });
  if (!org) redirect("/operator");

  const members = await db.orgMember.findMany({
    where: { orgId: params.orgId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <header className="mb-6">
        <Link href={`/operator/orgs/${params.orgId}`} className="text-[12px] text-umber hover:underline">
          ← back to org
        </Link>
        <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-umber">Access</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Members of {org.name}</h1>
        <p className="mt-2 max-w-md text-sm text-slate/60">
          Org members have access to this operator console for this org. They
          authenticate with their email. The magic link goes to their staff
          login flow as usual.
        </p>
      </header>

      <MembersPanel
        orgId={params.orgId}
        canManage={canBroadcast(access.role)}
        initial={members.map(m => ({
          id: m.id,
          email: m.email,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
