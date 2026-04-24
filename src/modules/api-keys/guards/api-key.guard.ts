import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiKeyService } from '../services/api-key.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly startTime = new Map<string, number>();

  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key required in X-API-Key header');
    }

    // Start timing for latency tracking
    this.startTime.set(request.id || 'default', Date.now());

    try {
      const validatedKey = await this.apiKeyService.validateKey(apiKey);
      request.apiKey = validatedKey; // Attach to request for scope checks

      this.logger.debug(`API key authenticated: ${validatedKey.prefix}...`);
      return true;
    } catch (error) {
      this.logger.warn(`API key authentication failed: ${error.message}`);
      throw error;
    }
  }
}
