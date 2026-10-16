import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { requestActorStorage } from '../common/context/request-actor.storage';
import { AuthenticatedUser } from './authenticated-user.interface';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard (runs after the JWT guard). An admin impersonating a user gets a
 * read-only session: every state-changing request - transfers, withdrawals,
 * wallet adjustments, API-key management, profile changes - is refused. It also
 * records the real actor so audit entries written during the request name them.
 */
@Injectable()
export class ImpersonationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<{
      method?: string;
      user?: AuthenticatedUser;
    }>();
    const user = request.user;
    if (!user?.impersonation) return true;

    if (user.actorId) {
      requestActorStorage.enterWith({ actorId: user.actorId });
    }

    if (!SAFE_METHODS.has((request.method ?? 'GET').toUpperCase())) {
      throw new ForbiddenException('Impersonated sessions are read-only');
    }
    return true;
  }
}
