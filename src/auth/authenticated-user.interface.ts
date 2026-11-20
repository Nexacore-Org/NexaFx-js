/**
 * The single shape placed on `request.user` by every JWT guard/strategy.
 * `id` always equals `sub`, so handlers never see an undefined user id.
 */
export interface AuthenticatedUser {
  id: string;
  sub: string;
  email?: string;
  role?: string;
  isEmailVerified?: boolean;
  /** Token version claim (`tv`); `TokenVersionGuard` compares it with the user's current version. */
  tokenVersion?: number;
  /** Id of the refresh-token session the access token belongs to (JWT `sid`). */
  sid?: string;
  /** How the request authenticated; API-key principals are always capped to role `user`. */
  authMethod?: 'jwt' | 'api_key';
  /** Scopes granted to an API-key principal. */
  scopes?: string[];
  /** Id of the API key that authenticated the request. */
  apiKeyId?: string;
  /** True for a short-lived admin impersonation session (read-only). */
  impersonation?: boolean;
  /** The real admin behind an impersonation session (RFC 8693 `act.sub`). */
  actorId?: string;
}
