/**
 * RFC 4180 CSV building for files that people open in spreadsheets.
 *
 * - Dates are written as ISO-8601 strings.
 * - Numbers are written as plain decimals, and are *not* treated as formulas
 *   (a negative amount like -5.25 must stay numeric).
 * - Text starting with `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'` so
 *   Excel/Sheets treat it as text, not a formula (OWASP "CSV injection").
 * - Cells containing a comma, quote, CR or LF are quoted with `"` doubled.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export type CsvValue = string | number | boolean | bigint | Date | null | undefined;

export function toCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  let text: string;
  let isNumeric = false;
  if (value instanceof Date) {
    text = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  } else if (typeof value === 'number') {
    text = Number.isFinite(value) ? String(value) : '';
    isNumeric = true;
  } else if (typeof value === 'bigint') {
    text = value.toString();
    isNumeric = true;
  } else {
    text = String(value);
  }

  if (!isNumeric && FORMULA_TRIGGER.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvRow(values: readonly CsvValue[]): string {
  return values.map(toCsvCell).join(',');
}

/** A header plus rows, joined with CRLF as RFC 4180 specifies and ending in a newline. */
export function toCsv(header: readonly string[], rows: Iterable<readonly CsvValue[]>): string {
  const lines = [toCsvRow(header)];
  for (const row of rows) lines.push(toCsvRow(row));
  return lines.join('\r\n') + '\r\n';
}
