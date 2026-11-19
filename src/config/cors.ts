/**
 * CORS origin parsing and policy (issue #1540).
 *
 * Previously `ALLOWED_ORIGINS` empty meant `origin: true`, i.e. reflect every
 * Origin together with `credentials: true`. The safe default for a financial
 * API is deny, so an empty list now yields no CORS headers in production.
 */

export class AllowedOriginsError extends Error {}

/**
 * Parses a comma separated `ALLOWED_ORIGINS` value into normalised origins.
 * Trims entries, ignores empties, rejects `*`, and rejects anything that is not
 * a valid http(s) URL. Paths, queries and trailing slashes are dropped
 * (`new URL(x).origin`).
 */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];

  const origins: string[] = [];
  for (const entry of raw.split(',')) {
    const value = entry.trim();
    if (!value) continue;
    if (value === '*') {
      throw new AllowedOriginsError(
        'ALLOWED_ORIGINS must not contain "*": credentialed CORS needs explicit origins',
      );
    }
    let origin: string;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
      origin = url.origin;
    } catch {
      throw new AllowedOriginsError(`ALLOWED_ORIGINS contains an invalid origin: "${value}"`);
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export interface CorsOptionsLike {
  origin: boolean | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void);
  credentials: boolean;
  maxAge: number;
}

/** One hour; keeps preflight caching bounded so policy changes take effect. */
export const CORS_MAX_AGE_SECONDS = 3600;

/**
 * Builds the options passed to `app.enableCors`.
 * - Configured origins: exact match only.
 * - Nothing configured, production: deny (`origin: false`, no CORS headers).
 * - Nothing configured, non-production: localhost origins only.
 * Requests without an Origin header (server to server, curl) are unaffected.
 * The cors middleware adds `Vary: Origin` whenever the origin is not a fixed value.
 */
export function buildCorsOptions(
  allowedOrigins: string[],
  nodeEnv: string | undefined,
): CorsOptionsLike {
  if (allowedOrigins.length === 0 && nodeEnv === 'production') {
    return { origin: false, credentials: true, maxAge: CORS_MAX_AGE_SECONDS };
  }

  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length > 0) return cb(null, allowedOrigins.includes(origin));
      return cb(null, LOCALHOST_ORIGIN.test(origin));
    },
    credentials: true,
    maxAge: CORS_MAX_AGE_SECONDS,
  };
}
