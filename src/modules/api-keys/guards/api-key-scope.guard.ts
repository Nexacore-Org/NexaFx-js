import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { ApiKeyService } from '../services/api-key.service';

@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyScopeGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.get<string[]>(REQUIRE_SCOPES_KEY, context.getHandler());
    
    // If no scopes required, allow access
    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.apiKey;

    if (!apiKey) {
      this.logger.warn('API key not found on request - ApiKeyGuard may not be applied');
      throw new ForbiddenException('API key authentication required');
    }

    const keyScopes = apiKey.scopes || [];

    // Check if key has at least one of the required scopes
    const hasScope = requiredScopes.some(scope => keyScopes.includes(scope));
    
    if (!hasScope) {
      this.logger.warn(
        `API key ${apiKey.prefix}... denied access. Required scopes: ${requiredScopes.join(', ')}. Has scopes: ${keyScopes.join(', ')}`,
      );
      throw new ForbiddenException('Insufficient API key scope');
    }

    this.logger.debug(`API key ${apiKey.prefix}... authorized for scopes: ${requiredScopes.join(', ')}`);
    return true;
  }
}
