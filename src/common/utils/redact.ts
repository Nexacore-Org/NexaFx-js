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

export function maskBody(body: unknown, depth = 0, maxDepth = MAX_MASK_DEPTH): unknown {
  if (!body || typeof body !== 'object') return body;
  if (depth >= maxDepth) return REDACTED;

  if (Array.isArray(body)) {
    return body.map((entry) => maskBody(entry, depth + 1, maxDepth));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    masked[key] = isSensitiveField(key) ? REDACTED : maskBody(value, depth + 1, maxDepth);
  }
  return masked;
}
