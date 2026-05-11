import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";
import { OrgsPanel } from "./orgs-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall — orgs" };

export default async function OrgsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/staff/login?next=/operator/orgs");
  if (!(await isPlatformStaffAsync(session))) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate/60">Operator only.</p>
      </main>
    );
  }
  return <OrgsPanel />;
}
