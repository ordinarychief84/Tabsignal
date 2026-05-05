import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing");
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Pin a stable API version to avoid drift on Stripe SDK upgrades.
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return client;
}
