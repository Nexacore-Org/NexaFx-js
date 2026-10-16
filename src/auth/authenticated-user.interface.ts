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
  /** `User.tokenVersion` the access token was issued with. */
  tokenVersion?: number;
}
