import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user.interface';
import { TokenVersionService } from './token-version.service';

/**
 * Global guard (after the JWT guard): a token whose version is older than the
 * user's current `tokenVersion` was issued before a role/status change and is
 * refused, so a demoted admin loses admin rights immediately.
 */
@Injectable()
export class TokenVersionGuard implements CanActivate {
  constructor(@Optional() private readonly versions?: TokenVersionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || !this.versions) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    // Public routes, API-key principals and non-JWT contexts have nothing to compare.
    if (!user?.id || user.authMethod === 'api_key') return true;

    const current = await this.versions.currentVersion(user.id);
    if (current === null) throw new UnauthorizedException('Account not found');
    if ((user.tokenVersion ?? 0) < current) {
      throw new UnauthorizedException('Session is out of date; please sign in again');
    }
    return true;
  }
}
