import { z } from "zod";

// unitCents is a signed integer to support comps / discounts as negative
// line items. Endpoints that accept staff-entered items should impose
// `nonnegative()` themselves (see /api/session/:id/items).
export const LineItem = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitCents: z.number().int(),
});
export type LineItem = z.infer<typeof LineItem>;

export const LineItems = z.array(LineItem);

/**
 * A tab total is now just the sum of what was ordered.
 *
 * TabCall no longer takes money from guests, so there is no charge to
 * add sales tax or a tip to — the guest settles with staff, on the
 * venue's own terminal, which is where tax and tipping now happen. Both
 * fields are gone rather than zeroed, so nothing can quietly render a
 * "$0.00 tax" line that implies we calculated one.
 */
export type Totals = {
  subtotalCents: number;
  totalCents: number;
};

export function parseLineItems(json: unknown): LineItem[] {
  const result = LineItems.safeParse(json);
  return result.success ? result.data : [];
}

/**
 * Sum of the line items on a tab. Used by the guest bill view, the staff
 * floor, exports, analytics and benchmarks alike — there is only one
 * number now, so there is only one function.
 */
export function totalsFor(items: LineItem[]): Totals {
  const subtotalCents = items.reduce((sum, it) => sum + it.quantity * it.unitCents, 0);
  return { subtotalCents, totalCents: subtotalCents };
}

export function dollars(cents: number): string {
  // Render negatives as "−$X.XX" using a true minus sign rather than "$-X".
  if (cents < 0) return `−$${(Math.abs(cents) / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
