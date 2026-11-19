import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../services/api-keys.service';

/**
 * @deprecated Use `@ApiKeyAllowed(...)` + the global `ApiKeyAuthGuard`, which enforces scopes, rate
 * limits, owner status and the role cap. This per-route guard builds a principal without email or
 * role and checks none of that; do not use it on new routes (issue #1525).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    try {
      const validKey = await this.apiKeysService.validateApiKey(apiKey);
      request.user = {
        id: validKey.userId,
        sub: validKey.userId,
        authMethod: 'api_key',
        scopes: validKey.scopes ?? [],
        apiKeyId: validKey.id,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid API key');
    }
  }
}
