// Coarse US state sales-tax lookup keyed by ZIP prefix (first 3 digits).
// Phase 0/1 only — Houston-focused. Texas state rate is 6.25%; local can add up to 2%.
// We return a venue-friendly default of 8.25% for TX ZIPs, 0% otherwise (forces explicit setup).
// Replace with TaxJar/Avalara in Phase 2 (PRD §15 Open Question 6).

const TX_PREFIXES = new Set([
  "750", "751", "752", "753", "754", "755", "756", "757", "758", "759", // DFW + East TX
  "760", "761", "762", "763", "764", "765", "766", "767", "768", "769", // Fort Worth, Wichita Falls, Abilene
  "770", "771", "772", "773", "774", "775", "776", "777", "778", "779", // Houston metro
  "780", "781", "782", "783", "784", "785", "786", "787", "788", "789", // San Antonio, Austin, Corpus Christi
  "790", "791", "792", "793", "794", "795", "796", "797", "798", "799", // West TX, El Paso
]);

export function taxRateForZip(zip: string): number {
  const prefix = zip.slice(0, 3);
  if (TX_PREFIXES.has(prefix)) return 0.0825;
  return 0; // explicit zero — caller should force a venue-level override before launching outside TX
}
