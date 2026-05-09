/**
 * Tiny CSV serializer. Adequate for our hand-curated exports — fields
 * with commas, quotes, or newlines are quoted with quote-doubling per
 * RFC 4180. Not a full streaming writer; rows live in memory before send.
 */

export function csv(rows: Array<Array<string | number | null>>): string {
  return rows.map(row => row.map(cell).join(",")).join("\n") + "\n";
}

function cell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value) : value;
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
