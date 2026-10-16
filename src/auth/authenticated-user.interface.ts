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
  /** True for a short-lived admin impersonation session (read-only). */
  impersonation?: boolean;
  /** The real admin behind an impersonation session (RFC 8693 `act.sub`). */
  actorId?: string;
}
