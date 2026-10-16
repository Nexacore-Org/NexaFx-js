import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_KEY_ALLOWED, API_KEY_REQUIRED_SCOPES } from '../api-key-scopes';
import { ApiKeyAuthService } from '../services/api-key-auth.service';
import { AuthenticatedUser } from '../../../auth/authenticated-user.interface';

/**
 * Global guard registered *before* the JWT guard. For routes that opted in with
 * `@ApiKeyAllowed(...)`, an `x-api-key` header (and no bearer token) is
 * authenticated here and `request.user` is set; the JWT guard then lets the
 * request through. Every other route is untouched.
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyAuth: ApiKeyAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    const allowed = this.reflector.getAllAndOverride<boolean>(API_KEY_ALLOWED, targets);
    if (!allowed) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUser;
    }>();
    const apiKey = request.headers['x-api-key'];
    const hasBearer = String(request.headers.authorization ?? '').startsWith('Bearer ');

    // No key, or a bearer token was supplied: leave authentication to the JWT guard.
    if (typeof apiKey !== 'string' || !apiKey || hasBearer) return true;

    const scopes =
      this.reflector.getAllAndOverride<string[]>(API_KEY_REQUIRED_SCOPES, targets) ?? [];
    request.user = await this.apiKeyAuth.authenticate(apiKey, scopes);
    return true;
  }
}
