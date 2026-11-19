/**
 * Secret hygiene checks that a length/shape-only Zod rule cannot express
 * (issue #1543). `.env.example` ships values that already satisfy every Zod
 * rule, so copying it to production used to be valid while signing JWTs and
 * encrypting wallet secrets with keys that are published in the repository.
 */

/** Variables that must each be a distinct, unguessable secret. */
export const DISTINCT_SECRET_KEYS = [
  'JWT_SECRET',
  'REFRESH_TOKEN_SECRET',
  'OTP_SECRET',
  'PROVIDER_WEBHOOK_SECRET',
] as const;

/** Secrets that must also be high entropy (includes the wallet key). */
export const STRONG_SECRET_KEYS = [...DISTINCT_SECRET_KEYS, 'WALLET_ENCRYPTION_KEY'] as const;

/**
 * Placeholder values published in `.env.example` and docs. `secret-hygiene.spec.ts`
 * parses `.env.example` and fails if a value there is missing from this list, so
 * the two cannot drift.
 */
export const KNOWN_PLACEHOLDER_SECRETS: readonly string[] = [
  'your_super_secret_jwt_key_must_be_at_least_32_characters_long_for_security',
  'your_super_secret_refresh_token_key_must_be_at_least_32_characters_long',
  'your_super_secret_otp_key_must_be_at_least_32_characters_long',
  'replace_with_a_random_secret_of_at_least_32_characters',
  'change-me-to-a-long-random-string',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'generate_with_openssl_rand_hex_32',
];

/**
 * True for values that look typed rather than generated: a single repeated
 * character, very few distinct characters, or a short pattern repeated to fill
 * the length (e.g. the sequential hex example key).
 */
export function isLowEntropySecret(value: string): boolean {
  if (value.length === 0) return true;
  if (new Set(value).size < 8) return true;
  for (let period = 1; period <= 16 && period < value.length; period++) {
    const unit = value.slice(0, period);
    if (unit.repeat(Math.ceil(value.length / period)).slice(0, value.length) === value) {
      return true;
    }
  }
  return false;
}

export interface SecretHygieneResult {
  /** Always fatal, in every environment. */
  errors: string[];
  /** Fatal in production, a warning elsewhere. */
  productionErrors: string[];
}

export function checkSecretHygiene(env: Partial<Record<string, string | undefined>>): SecretHygieneResult {
  const errors: string[] = [];
  const productionErrors: string[] = [];

  // Pairwise distinct: one leaked secret must not unlock the others.
  const seen = new Map<string, string>();
  for (const key of DISTINCT_SECRET_KEYS) {
    const value = env[key];
    if (!value) continue;
    const other = seen.get(value);
    if (other) {
      errors.push(`${key}: must differ from ${other} (each secret must be unique)`);
    } else {
      seen.set(value, key);
    }
  }

  for (const key of STRONG_SECRET_KEYS) {
    const value = env[key];
    if (!value) continue;
    if (KNOWN_PLACEHOLDER_SECRETS.includes(value)) {
      productionErrors.push(`${key}: is a placeholder from .env.example; generate a real value (openssl rand -hex 32)`);
    } else if (isLowEntropySecret(value)) {
      productionErrors.push(`${key}: looks low-entropy (repeated or sequential characters); generate a random value`);
    }
  }

  return { errors, productionErrors };
}
