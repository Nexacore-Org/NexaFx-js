import { Transform } from 'class-transformer';

/** Canonical form used everywhere an email is stored or looked up. */
export function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * DTO property decorator that trims and lower-cases an email before
 * validation, so `Alice@Example.com ` and `alice@example.com` are one identity.
 * Requires the global ValidationPipe to run with `transform: true`.
 */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) => normalizeEmail(value));
}
