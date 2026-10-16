import { applyDecorators, SetMetadata } from '@nestjs/common';

/** Closed set of permissions an API key can be granted. */
export enum ApiKeyScope {
  READ_TRANSACTIONS = 'read:transactions',
  READ_BALANCES = 'read:balances',
  WRITE_TRANSFERS = 'write:transfers',
}

export const API_KEY_SCOPES = Object.values(ApiKeyScope);

export const API_KEY_ALLOWED = 'apiKeyAllowed';
export const API_KEY_REQUIRED_SCOPES = 'apiKeyRequiredScopes';

/**
 * Mark a route as callable with `x-api-key` instead of a Bearer token, and
 * declare the scopes the key must hold. Routes without this decorator stay
 * JWT-only, so a key can never reach an endpoint nobody opted in.
 */
export const ApiKeyAllowed = (...scopes: ApiKeyScope[]) =>
  applyDecorators(
    SetMetadata(API_KEY_ALLOWED, true),
    SetMetadata(API_KEY_REQUIRED_SCOPES, scopes),
  );

export const API_KEY_MAX_RATE_LIMIT = 10_000;
export const API_KEY_DEFAULT_RATE_LIMIT = 1_000;
export const API_KEY_MAX_PER_USER = 10;
export const API_KEY_MAX_LIFETIME_DAYS = 365;
