/**
 * Operator console shell — SaaS-standard sidebar layout.
 *
 * Auth gate stays here (each page re-checks too): non-operators are
 * bounced before any operator chrome renders. Org-scoped pages under
 * /operator/orgs/[orgId] keep their own layout so org context doesn't
 * leak into this rail.
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { isOperatorAsync } from "@/lib/auth/operator";
import { AdminShell, type NavGroup } from "@/components/admin/sidebar";

const NAV: NavGroup[] = [
  {
    items: [{ href: "/operator", label: "Overview", exact: true }],
  },
  {
    heading: "Manage",
    items: [
      { href: "/operator/orgs", label: "Organizations" },
      { href: "/operator/venues", label: "Venues" },
      { href: "/operator/admins", label: "Operators" },
    ],
  },
  {
    heading: "Platform",
    items: [
      { href: "/operator/audit", label: "Audit log" },
      { href: "/operator/security", label: "Security" },
      { href: "/operator/settings", label: "Settings" },
    ],
  },
];

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();
  if (!session) {
    const reachedPath = headers().get("x-pathname") ?? "/operator";
    redirect(`/staff/login?next=${encodeURIComponent(reachedPath)}`);
  }
  if (!(await isOperatorAsync(session))) {
    redirect("/staff");
  }

  return (
    <AdminShell
      brand={{ href: "/operator", name: "TabCall" }}
      roleLabel="operator"
      groups={NAV}
      // /admin/account/password requires a PlatformAdmin session; both
      // venue managers and operators hold STAFF sessions, so that link
      // bounced every one of them to a super-admin login they cannot pass.
      account={{ email: session.email, changePasswordHref: "/staff/account/password" }}
    >
      {children}
    </AdminShell>
  );
}
