import "server-only";

/** Escapes a single CSV field per RFC 4180 (quotes any value containing a comma, quote, or newline). */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Converts an array of flat records into a CSV string (opens directly in Excel). */
export function toCsv(rows: object[], columns: string[]): string {
  const header = columns.map(escapeCsvField).join(",");
  const body = rows.map((row) =>
    columns.map((col) => escapeCsvField((row as Record<string, unknown>)[col])).join(","),
  );
  return [header, ...body].join("\r\n");
}
