/**
 * Sales-tax resolution for a venue.
 *
 * Two sources, in priority order:
 *
 *   1. `Venue.taxRateBps` — an explicit per-venue rate in basis points
 *      (825 = 8.25%). This is the real answer: rates vary by city and
 *      county, not just state, and only the operator knows what their
 *      jurisdiction charges.
 *   2. The ZIP-prefix fallback below — a coarse Texas-only table kept
 *      from Phase 0/1 so existing Houston venues keep working without a
 *      backfill.
 *
 * There is deliberately NO silent 0% path for a venue that is taking
 * money. `resolveTaxRate` returns null when it cannot determine a rate,
 * and callers that charge a guest must refuse rather than treat that as
 * tax-free — see `requireTaxRate`. Under-collecting sales tax is the
 * venue's legal liability, so "we didn't know" must fail loudly at
 * setup time rather than quietly on every bill.
 */

// Texas ZIP prefixes. State rate is 6.25%; local adds up to 2%, so 8.25%
// is the common Houston/DFW/Austin figure and a safe default for TX.
const TX_PREFIXES = new Set([
  "750", "751", "752", "753", "754", "755", "756", "757", "758", "759", // DFW + East TX
  "760", "761", "762", "763", "764", "765", "766", "767", "768", "769", // Fort Worth, Wichita Falls, Abilene
  "770", "771", "772", "773", "774", "775", "776", "777", "778", "779", // Houston metro
  "780", "781", "782", "783", "784", "785", "786", "787", "788", "789", // San Antonio, Austin, Corpus Christi
  "790", "791", "792", "793", "794", "795", "796", "797", "798", "799", // West TX, El Paso
]);

/** The tax-relevant slice of a Venue row. Every totals call site passes this. */
export type VenueTax = {
  zipCode: string | null;
  taxRateBps: number | null;
};

/** Highest rate we'll accept on the admin form — no US jurisdiction is near 20%. */
export const MAX_TAX_RATE_BPS = 2000;

/**
 * Legacy ZIP fallback. Returns null (not 0) outside Texas so the caller
 * has to decide what "unknown" means rather than inheriting a zero.
 */
export function taxRateForZip(zip: string): number | null {
  const prefix = zip.slice(0, 3);
  if (TX_PREFIXES.has(prefix)) return 0.0825;
  return null;
}

/**
 * The venue's effective tax rate as a decimal (0.0825), or null when we
 * genuinely don't know. An explicit `taxRateBps` always wins — including
 * an explicit 0, which is a real answer in a no-sales-tax jurisdiction
 * (Delaware, Oregon, Montana, New Hampshire) and must not fall through
 * to the ZIP table.
 */
export function resolveTaxRate(venue: VenueTax): number | null {
  if (venue.taxRateBps !== null && venue.taxRateBps !== undefined) {
    return venue.taxRateBps / 10_000;
  }
  return taxRateForZip(venue.zipCode ?? "");
}

/**
 * True when the venue has a usable tax rate. Onboarding and the payment
 * routes gate on this — a venue cannot go live, or take a guest payment,
 * until sales tax is a known quantity.
 */
export function hasTaxRate(venue: VenueTax): boolean {
  return resolveTaxRate(venue) !== null;
}
