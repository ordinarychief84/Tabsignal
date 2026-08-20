import { z } from "zod";
import { resolveTaxRate, type VenueTax } from "./tax";

export type { VenueTax };

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

export type Totals = {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
};

export function parseLineItems(json: unknown): LineItem[] {
  const result = LineItems.safeParse(json);
  return result.success ? result.data : [];
}

/**
 * Computes totals client-side AND server-side. Truth is server-side at payment time.
 * tipPercent: 0..50 (we clamp). For "custom", pass the exact percent.
 *
 * A venue with no resolvable tax rate is billed at 0% HERE — this
 * function backs displays and reporting (exports, analytics,
 * benchmarks), where a missing rate must not crash a dashboard. Money
 * paths must NOT use it: call `totalsForCharge`, which refuses instead
 * of quietly under-taxing a real guest.
 */
export function totalsFor(items: LineItem[], venue: VenueTax, tipPercent: number): Totals {
  return computeTotals(items, resolveTaxRate(venue) ?? 0, tipPercent);
}

/**
 * Totals for an actual charge. Returns an error rather than a number
 * when the venue's tax rate is unknown, so no guest is ever charged a
 * silently tax-free total. See lib/tax.ts for why unknown ≠ zero.
 */
export function totalsForCharge(
  items: LineItem[],
  venue: VenueTax,
  tipPercent: number,
): { ok: true; totals: Totals } | { ok: false; error: "TAX_RATE_UNSET" } {
  const taxRate = resolveTaxRate(venue);
  if (taxRate === null) return { ok: false, error: "TAX_RATE_UNSET" };
  return { ok: true, totals: computeTotals(items, taxRate, tipPercent) };
}

function computeTotals(items: LineItem[], taxRate: number, tipPercent: number): Totals {
  const subtotalCents = items.reduce((s, it) => s + it.quantity * it.unitCents, 0);
  const taxCents = Math.round(subtotalCents * taxRate);
  const tip = Math.max(0, Math.min(50, tipPercent));
  const tipCents = Math.round(subtotalCents * (tip / 100));
  const totalCents = subtotalCents + taxCents + tipCents;
  return { subtotalCents, taxCents, tipCents, totalCents };
}

export function dollars(cents: number): string {
  // Render negatives as "−$X.XX" using a true minus sign rather than "$-X".
  if (cents < 0) return `−$${(Math.abs(cents) / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
