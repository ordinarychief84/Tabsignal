/**
 * Manage TabCall platform admins (founder allowlist).
 *
 * Two sources are merged into one list:
 *   - OPERATOR_EMAILS env entries (read-only here; edit in Vercel + redeploy)
 *   - PlatformAdmin DB rows (mutable: add / suspend / reactivate / remove)
 */

import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";
import { AdminsPanel } from "./admins-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — admins" };

export default async function AdminsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator/admins");
  if (!(await isPlatformStaffAsync(session))) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-sm text-center">
          <p className="text-3xl">·</p>
          <h1 className="mt-3 text-2xl font-medium text-slate">Operator only.</h1>
          <p className="mt-3 text-sm text-slate/60">
            You&rsquo;re signed in as <span className="font-mono text-[12px]">{session.email}</span>.
          </p>
        </div>
      </main>
    );
  }
  return <AdminsPanel selfEmail={session.email.toLowerCase()} />;
}
