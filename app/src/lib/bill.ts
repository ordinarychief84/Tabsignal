import { z } from "zod";
import { taxRateForZip } from "./tax";

export const LineItem = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitCents: z.number().int().nonnegative(),
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
 */
export function totalsFor(items: LineItem[], zipCode: string, tipPercent: number): Totals {
  const subtotalCents = items.reduce((s, it) => s + it.quantity * it.unitCents, 0);
  const taxRate = taxRateForZip(zipCode);
  const taxCents = Math.round(subtotalCents * taxRate);
  const tip = Math.max(0, Math.min(50, tipPercent));
  const tipCents = Math.round(subtotalCents * (tip / 100));
  const totalCents = subtotalCents + taxCents + tipCents;
  return { subtotalCents, taxCents, tipCents, totalCents };
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
