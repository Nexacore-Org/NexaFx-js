import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../services/rate-limit.service';
import {
  RATE_LIMIT_OPTIONS,
  RATE_LIMIT_DEFAULTS,
} from '../constants/rate-limit.constants';
import { RateLimitOptions } from '../interfaces/rate-limit-options.interface';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMIT_OPTIONS) private readonly options: RateLimitOptions,
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {
    this.options = { ...RATE_LIMIT_DEFAULTS, ...options };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const response = httpContext.getResponse();

    // Skip if rate limiting is disabled for this route
    const isPublic = this.reflector.get<boolean>(
      'isPublic',
      context.getHandler(),
    );
    if (isPublic) {
      return true;
    }

    // Get rate limit options from metadata or use defaults
    const options = this.getRateLimitOptions(context) || this.options;

    // Skip if the request should be skipped
    if (options.skip && options.skip(request, response)) {
      return true;
    }

    // Generate a key for rate limiting
    const key = options.keyGenerator
      ? options.keyGenerator(request)
      : request.ip;

    // Check if the request is allowed
    const isAllowed = await this.rateLimitService.consume(key);

    if (!isAllowed) {
      if (options.handler) {
        return options.handler(request, response, () => {});
      }
      response.status(options.statusCode).json({
        statusCode: options.statusCode,
        message: options.message,
      });
      return false;
    }

    return true;
  }

  private getRateLimitOptions(
    context: ExecutionContext,
  ): RateLimitOptions | null {
    const options = this.reflector.get<RateLimitOptions>(
      'rateLimit',
      context.getHandler(),
    );
    return options ? { ...this.options, ...options } : null;
  }
}
