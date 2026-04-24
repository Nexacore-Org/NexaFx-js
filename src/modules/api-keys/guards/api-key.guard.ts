import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKeyScope } from '../entities/api-key.entity';

export const REQUIRED_API_SCOPE = 'required_api_scope';
export const RequireApiScope = (scope: ApiKeyScope) => SetMetadata(REQUIRED_API_SCOPE, scope);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey: string | undefined = request.headers['x-api-key'];

    if (!rawKey) {
      throw new UnauthorizedException('X-API-Key header is required');
    }

    const requiredScope = this.reflector.getAllAndOverride<ApiKeyScope>(REQUIRED_API_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);

    const apiKey = await this.apiKeyService.validate(rawKey, requiredScope);
    request.apiKey = apiKey;

    return true;
  }
}
