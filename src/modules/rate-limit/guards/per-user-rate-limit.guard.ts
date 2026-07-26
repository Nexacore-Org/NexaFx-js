import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  PerUserRateLimitService,
  PerUserRateLimitResult,
} from '../services/per-user-rate-limit.service';

@Injectable()
export class PerUserRateLimitGuard implements CanActivate {
  constructor(
    private readonly perUserRateLimitService: PerUserRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const userId = request.user?.id || request.user?.userId;
    if (!userId) {
      return true;
    }

    const endpoint = request.route?.path || request.url;
    const method = request.method;

    const result: PerUserRateLimitResult =
      await this.perUserRateLimitService.check(userId, endpoint, method);

    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: Math.ceil(
            (result.resetAt.getTime() - Date.now()) / 1000,
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
