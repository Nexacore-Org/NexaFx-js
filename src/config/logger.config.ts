/**
 * pino-http options (issue #1547).
 *
 * The library defaults log every request's headers, so `Authorization: Bearer
 * <jwt>`, `Cookie` and `x-api-key` ended up in stdout, and `req.url` carried
 * `?token=` values (export downloads, password reset links). Extracted from
 * app.module.ts so it can be unit tested.
 *
 * Request bodies are NOT logged. If body logging is ever added, pass the body
 * through `maskBody` from src/common/utils/redact.ts first.
 */

export const REDACTED_PLACEHOLDER = '[REDACTED]';

/** Query parameters whose values must never be logged. */
export const SENSITIVE_QUERY_PARAMS = [
  'token',
  'code',
  'signature',
  'key',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'password',
  'secret',
];

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

/** Paths that are noisy and carry no information worth a log line per call. */
export const IGNORED_REQUEST_PATHS = ['/api/v1/health', '/api/v1/metrics'];

/** Masks the values of sensitive query parameters in a URL path (path preserved). */
export function maskSensitiveQuery(url: string | undefined): string | undefined {
  if (!url) return url;
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const base = url.slice(0, queryStart);
  const hashStart = url.indexOf('#', queryStart);
  const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const fragment = hashStart === -1 ? '' : url.slice(hashStart);

  const masked = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const name = eq === -1 ? pair : pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // keep the raw name
      }
      return SENSITIVE_QUERY_PARAMS.includes(decoded.toLowerCase()) && eq !== -1
        ? `${name}=${REDACTED_PLACEHOLDER}`
        : pair;
    })
    .join('&');

  return `${base}?${masked}${fragment}`;
}

interface SerializableRequest {
  id?: unknown;
  method?: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, unknown>;
}

/** Keeps method, a masked url and only the two headers useful for support. */
export function serializeRequest(req: SerializableRequest) {
  const headers = req.headers ?? {};
  return {
    id: req.id,
    method: req.method,
    url: maskSensitiveQuery(req.originalUrl ?? req.url),
    headers: {
      'user-agent': headers['user-agent'],
      'x-correlation-id': headers['x-correlation-id'],
    },
  };
}

export function buildPinoHttpOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    level: env.LOG_LEVEL || 'info',
    redact: { paths: REDACT_PATHS, censor: REDACTED_PLACEHOLDER },
    serializers: { req: serializeRequest },
    autoLogging: {
      ignore: (req: { url?: string }) =>
        IGNORED_REQUEST_PATHS.includes((req.url ?? '').split('?')[0]),
    },
    transport:
      env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  };
}
