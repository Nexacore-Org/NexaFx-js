/**
 * CSV cell escaping for exports opened in spreadsheets.
 *
 * Besides RFC 4180 quoting, any cell that starts with `=`, `+`, `-`, `@`, TAB
 * or CR is prefixed with `'` so Excel/Sheets treat it as text instead of a
 * formula (OWASP "CSV injection"). Numbers are left alone: a plain negative
 * amount such as -5.25 must stay numeric.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvEscape(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  if (typeof value !== 'number' && FORMULA_TRIGGER.test(str)) {
    str = `'${str}`;
  }
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
