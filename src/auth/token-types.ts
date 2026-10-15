/**
 * Purpose of a signed JWT, carried in the `typ` claim. Only `access` tokens may
 * authenticate API requests; every other purpose is rejected by the guards.
 */
export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  SEP10 = 'sep10',
  EXPORT_DOWNLOAD = 'export-download',
}
