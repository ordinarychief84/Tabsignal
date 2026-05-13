/**
 * /founder — convenience entry point for TabCall founders.
 *
 * Single-purpose redirect:
 *   - Authenticated + isOperator → /operator/settings
 *   - Authenticated + NOT operator → /admin (their venue dashboard)
 *   - Unauthenticated → /staff/login?next=/operator/settings
 *
 * Lets a founder bookmark `tab-call.com/founder` instead of remembering
 * the deep /staff/login?next=/operator/settings URL.
 */

import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { isPlatformStaffAsync } from "@/lib/auth/operator";

export const dynamic = "force-dynamic";
export const metadata = { title: "TabCall · founder" };

export default async function FounderShortcut() {
  const session = await getStaffSession();
  if (!session) {
    redirect("/staff/login?next=/operator/settings");
  }
  if (await isPlatformStaffAsync(session)) {
    redirect("/operator/settings");
  }
  // Authenticated venue user — no super-admin powers. Send them to
  // their venue dashboard instead of the operator denial page.
  redirect("/admin");
}
