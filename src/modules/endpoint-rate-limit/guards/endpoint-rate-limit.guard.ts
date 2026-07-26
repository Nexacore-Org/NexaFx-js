import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { EndpointRateLimitService } from '../services/endpoint-rate-limit.service';

@Injectable()
export class EndpointRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(EndpointRateLimitGuard.name);

  constructor(
    private readonly endpointRateLimitService: EndpointRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const endpoint = request.route?.path || request.url;
    const method = request.method;

    try {
      const result = await this.endpointRateLimitService.checkRateLimit(endpoint, method);

      response.setHeader('X-RateLimit-Remaining', result.remaining);

      if (!result.allowed) {
        const retryAfterSecs = Math.ceil(result.retryAfterMs / 1000);
        response.setHeader('Retry-After', retryAfterSecs);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded for this endpoint. Please try again later.',
            error: 'Too Many Requests',
            retryAfter: retryAfterSecs,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Endpoint rate limit check failed: ${error.message}`);
      return true;
    }
  }
}
