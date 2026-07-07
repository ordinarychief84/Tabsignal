/**
 * Tiny CSV serializer. Adequate for our hand-curated exports — fields
 * with commas, quotes, or newlines are quoted with quote-doubling per
 * RFC 4180. Not a full streaming writer; rows live in memory before send.
 *
 * Formula-injection hardening: exports contain guest/staff-controlled
 * strings (item names, guest names, notes) and are opened in Excel /
 * Sheets, which execute cells starting with = + - @ (and tab/CR
 * variants) as formulas — the classic CSV-injection vector (a menu item
 * named `=HYPERLINK(...)` exfiltrating on open). Such cells get an
 * apostrophe prefix, the OWASP-recommended neutralization: spreadsheets
 * render the value as text, and the leading ' is invisible in Excel.
 */

export function csv(rows: Array<Array<string | number | null>>): string {
  return rows.map(row => row.map(cell).join(",")).join("\n") + "\n";
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function cell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && FORMULA_TRIGGER.test(s)) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvResponseHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  };
}
