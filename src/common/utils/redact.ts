/**
 * Shared redaction helpers for anything that logs or persists arbitrary
 * objects (exception logs, audit snapshots).
 */
export const REDACTED = '[REDACTED]';

/**
 * Substrings that make a field name sensitive wherever they appear, so a newly
 * added field such as `webhookSecret` or `newPasswordHash` is covered without
 * anyone remembering to update a list. Matched case-insensitively against the
 * key with separators stripped, so `api_key`, `apiKey` and `API-KEY` all match.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'credential',
  'privatekey',
  'mnemonic',
  'seedphrase',
  'signature',
  'otp',
  'totp',
  'backupcode',
  'recoverycode',
  'authorization',
  'cookie',
  'cvv',
];

/**
 * Field names that are sensitive on their own but too generic to match as a
 * substring — redacting every key containing "code" would also hide
 * `countryCode` and `referralCode`, which are useful when debugging.
 */
const SENSITIVE_KEY_EXACT = new Set(['code', 'pin', 'auth', 'key', 'hash']);

const MAX_MASK_DEPTH = 6;

export function isSensitiveField(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    SENSITIVE_KEY_EXACT.has(normalised) ||
    SENSITIVE_KEY_PATTERNS.some((pattern) => normalised.includes(pattern))
  );
}

/**
 * Personal data that is not a credential but still must not sit in logs or exportable audit
 * snapshots (issue #1532). Matched on the normalised key (lower-case, separators stripped), exactly.
 */
const PII_KEYS = new Set([
  'email',
  'documentnumber',
  'documenturl',
  'phone',
  'phonenumber',
  'iban',
  'accountnumber',
  'address',
  'dateofbirth',
]);

export function isPiiField(key: string): boolean {
  return PII_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

export interface MaskOptions {
  /**
   * Field names (any casing/separators) that must stay readable even though they are PII. Audit
   * snapshots use `['email']`: an administrator action such as "role changed for <email>" is
   * useless without it. Credentials are never exempt.
   */
  keepFields?: string[];
}

const normaliseKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function maskBody(
  body: unknown,
  depth = 0,
  maxDepth = MAX_MASK_DEPTH,
  options: MaskOptions = {},
): unknown {
  if (!body || typeof body !== 'object') return body;
  if (depth >= maxDepth) return REDACTED;

  if (Array.isArray(body)) {
    return body.map((entry) => maskBody(entry, depth + 1, maxDepth, options));
  }

  const keep = new Set((options.keepFields ?? []).map(normaliseKey));
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (isSensitiveField(key) || (isPiiField(key) && !keep.has(normaliseKey(key)))) {
      masked[key] = REDACTED;
    } else {
      masked[key] = maskBody(value, depth + 1, maxDepth, options);
    }
  }
  return masked;
}

/** Query parameters that carry bearer credentials (download tokens, reset tokens, API keys). */
export const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'code',
  'key',
  'signature',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'secret',
]);

/**
 * Masks the values of sensitive query parameters in a request URL, keeping the path, the other
 * parameters and any fragment (issue #1532). Anything in a query string ends up in logs and in the
 * `path` echoed to the client, so credentials such as the export download token must not appear.
 */
export function redactUrl(url: string | undefined | null): string {
  if (!url) return url ?? '';
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;

  const hashStart = url.indexOf('#', queryStart);
  const base = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  const fragment = hashStart === -1 ? '' : url.slice(hashStart);

  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const rawName = pair.slice(0, eq);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName);
      } catch {
        // keep the raw name
      }
      return SENSITIVE_QUERY_PARAMS.has(name.toLowerCase()) ? `${rawName}=${REDACTED}` : pair;
    })
    .join('&');

  return `${base}?${redacted}${fragment}`;
}
