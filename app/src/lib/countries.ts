/**
 * Country data for the signup phone-input.
 *
 * Curated list of the markets we serve today plus the next likely
 * expansion countries. Each entry carries:
 *   - iso       — ISO 3166-1 alpha-2 code, stored on Venue.country
 *   - name      — display name in the dropdown
 *   - dialCode  — E.164 country calling code without "+" (e.g. "1", "44", "972")
 *   - flag      — flag emoji for the dropdown row (renders without
 *                 webfont dependencies; degrades to text on systems
 *                 lacking emoji support)
 *
 * Ordering is alphabetical by name so the dropdown is scannable.
 * Adding a country is a one-line change here — no other code needs
 * to know the full list.
 */

export type Country = {
  iso: string;
  name: string;
  dialCode: string;
  flag: string;
};

export const COUNTRIES: ReadonlyArray<Country> = [
  { iso: "AE", name: "United Arab Emirates", dialCode: "971", flag: "🇦🇪" },
  { iso: "AR", name: "Argentina",            dialCode: "54",  flag: "🇦🇷" },
  { iso: "AT", name: "Austria",              dialCode: "43",  flag: "🇦🇹" },
  { iso: "AU", name: "Australia",            dialCode: "61",  flag: "🇦🇺" },
  { iso: "BE", name: "Belgium",              dialCode: "32",  flag: "🇧🇪" },
  { iso: "BR", name: "Brazil",               dialCode: "55",  flag: "🇧🇷" },
  { iso: "CA", name: "Canada",               dialCode: "1",   flag: "🇨🇦" },
  { iso: "CH", name: "Switzerland",          dialCode: "41",  flag: "🇨🇭" },
  { iso: "CL", name: "Chile",                dialCode: "56",  flag: "🇨🇱" },
  { iso: "CO", name: "Colombia",             dialCode: "57",  flag: "🇨🇴" },
  { iso: "DE", name: "Germany",              dialCode: "49",  flag: "🇩🇪" },
  { iso: "DK", name: "Denmark",              dialCode: "45",  flag: "🇩🇰" },
  { iso: "ES", name: "Spain",                dialCode: "34",  flag: "🇪🇸" },
  { iso: "FI", name: "Finland",              dialCode: "358", flag: "🇫🇮" },
  { iso: "FR", name: "France",               dialCode: "33",  flag: "🇫🇷" },
  { iso: "GB", name: "United Kingdom",       dialCode: "44",  flag: "🇬🇧" },
  { iso: "GR", name: "Greece",               dialCode: "30",  flag: "🇬🇷" },
  { iso: "HK", name: "Hong Kong",            dialCode: "852", flag: "🇭🇰" },
  { iso: "ID", name: "Indonesia",            dialCode: "62",  flag: "🇮🇩" },
  { iso: "IE", name: "Ireland",              dialCode: "353", flag: "🇮🇪" },
  { iso: "IL", name: "Israel",               dialCode: "972", flag: "🇮🇱" },
  { iso: "IN", name: "India",                dialCode: "91",  flag: "🇮🇳" },
  { iso: "IT", name: "Italy",                dialCode: "39",  flag: "🇮🇹" },
  { iso: "JP", name: "Japan",                dialCode: "81",  flag: "🇯🇵" },
  { iso: "KR", name: "South Korea",          dialCode: "82",  flag: "🇰🇷" },
  { iso: "MX", name: "Mexico",               dialCode: "52",  flag: "🇲🇽" },
  { iso: "MY", name: "Malaysia",             dialCode: "60",  flag: "🇲🇾" },
  { iso: "NL", name: "Netherlands",          dialCode: "31",  flag: "🇳🇱" },
  { iso: "NO", name: "Norway",               dialCode: "47",  flag: "🇳🇴" },
  { iso: "NZ", name: "New Zealand",          dialCode: "64",  flag: "🇳🇿" },
  { iso: "PH", name: "Philippines",          dialCode: "63",  flag: "🇵🇭" },
  { iso: "PL", name: "Poland",               dialCode: "48",  flag: "🇵🇱" },
  { iso: "PT", name: "Portugal",             dialCode: "351", flag: "🇵🇹" },
  { iso: "SA", name: "Saudi Arabia",         dialCode: "966", flag: "🇸🇦" },
  { iso: "SE", name: "Sweden",               dialCode: "46",  flag: "🇸🇪" },
  { iso: "SG", name: "Singapore",            dialCode: "65",  flag: "🇸🇬" },
  { iso: "TH", name: "Thailand",             dialCode: "66",  flag: "🇹🇭" },
  { iso: "TW", name: "Taiwan",               dialCode: "886", flag: "🇹🇼" },
  { iso: "US", name: "United States",        dialCode: "1",   flag: "🇺🇸" },
  { iso: "VN", name: "Vietnam",              dialCode: "84",  flag: "🇻🇳" },
  { iso: "ZA", name: "South Africa",         dialCode: "27",  flag: "🇿🇦" },
];

/** Quick O(1) lookup by ISO code. Build once, share. */
const COUNTRY_BY_ISO: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map(c => [c.iso, c]),
);

export function countryByIso(iso: string | null | undefined): Country | null {
  if (!iso) return null;
  return COUNTRY_BY_ISO.get(iso.toUpperCase()) ?? null;
}

/**
 * Default country for the signup form. Reads Vercel's edge-set
 * `x-vercel-ip-country` header (always uppercase ISO alpha-2). Falls
 * back to `US` so dev / non-Vercel environments still get a sane
 * default. Returns the full Country record so the form can prefill
 * both the dropdown and the dial-code prefix without a second lookup.
 */
export function detectCountryFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
): Country {
  const get = (k: string): string | null => {
    if (headers instanceof Headers) return headers.get(k);
    const v = headers[k.toLowerCase()];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" ? v : null;
  };
  const iso = (get("x-vercel-ip-country") ?? get("cf-ipcountry") ?? "").toUpperCase();
  return countryByIso(iso) ?? countryByIso("US")!;
}

/**
 * Compose a Country + national-number-as-typed into an E.164 string.
 * The form gives us the dial code and a free-text national portion;
 * we normalise to "+<dial><digits>" with all non-digits stripped.
 *
 * Returns null when the cleaned string isn't a plausible phone — too
 * short, too long, or empty. Callers should treat that as a form
 * validation error.
 */
export function toE164(country: Country, nationalPart: string): string | null {
  const digits = nationalPart.replace(/\D+/g, "");
  // E.164 max length is 15 digits including the country code. Our
  // dial codes are 1–3 digits, so the national portion can be at most
  // 14. Lower bound 6 catches blank / clearly-wrong entries while
  // still allowing short-format numbers like SG (8 digits).
  if (digits.length < 6 || digits.length > 14) return null;
  return `+${country.dialCode}${digits}`;
}

/** Loose E.164 validator for server-side acceptance. Same shape as
 *  the client-side toE164 produces. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}
