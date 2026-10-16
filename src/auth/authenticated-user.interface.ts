/**
 * The single shape placed on `request.user` by every JWT guard/strategy.
 * `id` always equals `sub`, so handlers never see an undefined user id.
 */
export interface AuthenticatedUser {
  id: string;
  sub: string;
  email: string;
  role: string;
  isEmailVerified?: boolean;
  /** How the request was authenticated. Absent means a normal bearer JWT. */
  authMethod?: 'jwt' | 'api_key';
  /** Scopes granted to the API key (only when `authMethod` is `api_key`). */
  scopes?: string[];
  /** Id of the API key used (only when `authMethod` is `api_key`). */
  apiKeyId?: string;
  /** Id of the refresh token (session) this access token was issued for. */
  sid?: string;
}
