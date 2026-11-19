import { AuthenticatedUser } from './authenticated-user.interface';

/**
 * The one claim set every access token carries. The global guard and the passport `JwtStrategy`
 * each used to declare their own `JwtPayload` and build a different principal from it, so the same
 * token behaved differently depending on the route (issue #1536).
 */
export interface JwtPayload {
  sub?: string;
  typ?: string;
  email?: string;
  role?: string;
  roles?: string[];
  isEmailVerified?: boolean;
  /** Issued-at, seconds since the epoch. */
  iat?: number;
  /** Refresh-token session this access token belongs to. */
  sid?: string;
  /** User token version at issue time (`TokenVersionGuard`). */
  tv?: number;
  /** True for an admin impersonation session (read-only). */
  impersonation?: boolean;
  /** RFC 8693 actor: the real admin behind an impersonation session. */
  act?: { sub?: string };
}

/** Principal placed on `request.user`. Identical for every JWT route, whichever guard runs. */
export function buildPrincipal(payload: JwtPayload): AuthenticatedUser {
  return {
    id: payload.sub as string,
    sub: payload.sub as string,
    email: payload.email ?? '',
    role: payload.role ?? '',
    isEmailVerified: payload.isEmailVerified,
    authMethod: 'jwt',
    tokenVersion: payload.tv ?? 0,
    ...(payload.sid ? { sid: payload.sid } : {}),
    ...(payload.impersonation ? { impersonation: true, actorId: payload.act?.sub } : {}),
  };
}
