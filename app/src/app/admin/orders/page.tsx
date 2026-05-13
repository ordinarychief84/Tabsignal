import { redirectToVenueAdmin } from "@/lib/admin-redirect";

export const dynamic = "force-dynamic";

export default async function FlatAdminOrders() {
  return redirectToVenueAdmin("orders");
}
