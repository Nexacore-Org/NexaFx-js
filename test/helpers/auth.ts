import { sign } from 'jsonwebtoken';
import { TokenType } from '../../src/auth/token-types';

/**
 * Reusable helper for request-level tests: signs an access token with the same
 * claim shape the real AuthService issues, so the global JwtAuthGuard,
 * Passport strategy and role guards accept it (issue #1611).
 */
export type TestRole = 'USER' | 'ADMIN' | 'COMPLIANCE';

const ROLE_CLAIMS: Record<TestRole, string> = {
  USER: 'user',
  ADMIN: 'admin',
  COMPLIANCE: 'compliance',
};

export interface SignAccessTokenOptions {
  sub?: string;
  email?: string;
  tokenVersion?: number;
  secret?: string;
}

export function signAccessToken(
  role: TestRole,
  options: SignAccessTokenOptions = {},
): string {
  const secret =
    options.secret ??
    process.env.JWT_SECRET ??
    'test-jwt-secret-must-be-at-least-32-chars';
  const roleClaim = ROLE_CLAIMS[role];

  return sign(
    {
      sub: options.sub ?? `test-${roleClaim}-id`,
      email: options.email ?? `${roleClaim}@example.com`,
      role: roleClaim,
      roles: [roleClaim],
      typ: TokenType.ACCESS,
      tv: options.tokenVersion ?? 0,
      isEmailVerified: true,
    },
    secret,
  );
}

/** Ready-to-use `Authorization` header value. */
export function authHeader(
  role: TestRole,
  options: SignAccessTokenOptions = {},
): string {
  return `Bearer ${signAccessToken(role, options)}`;
}
