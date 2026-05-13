import { redirectToVenueAdmin } from "@/lib/admin-redirect";

export const dynamic = "force-dynamic";

export default async function FlatAdminBranding() {
  return redirectToVenueAdmin("branding");
}
