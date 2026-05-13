import { redirectToVenueAdmin } from "@/lib/admin-redirect";

export const dynamic = "force-dynamic";

export default async function FlatAdminPos() {
  return redirectToVenueAdmin("pos");
}
