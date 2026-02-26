import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RateLimitService,
  RateLimitContext,
} from '../services/rate-limit.service';
import { UserTier, RiskLevel } from '../entities/rate-limit-rule.entity';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RATE_LIMIT_SKIP_KEY = 'skipRateLimit';

export interface RateLimitOptions {
  tier?: UserTier;
  riskLevel?: RiskLevel;
  skipIf?: (context: ExecutionContext) => boolean;
}

/**
 * Decorator to skip rate limiting on a route
 */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);

/**
 * Decorator to set custom rate limit options
 */
export const RateLimit = (options?: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options || {});

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if rate limiting is skipped for this route
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      RATE_LIMIT_SKIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipRateLimit) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Get rate limit options from decorator
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Check skip condition if provided
    if (options?.skipIf && options.skipIf(context)) {
      return true;
    }

    // Extract user information from request
    // This assumes the JWT guard sets req.user
    const userId = request.user?.id || request.user?.userId;
    const userTier =
      options?.tier ||
      request.user?.tier ||
      this.determineTierFromRequest(request);
    const riskLevel =
      options?.riskLevel ||
      request.user?.riskLevel ||
      this.determineRiskLevel(request);

    // Get IP address
    const ipAddress =
      request.ip ||
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.connection?.remoteAddress ||
      'unknown';

    // Get route and method
    const route = request.route?.path || request.url;
    const method = request.method;

    // Create rate limit context
    const rateLimitContext: RateLimitContext = {
      userId,
      tier: userTier,
      riskLevel,
      ipAddress,
      route,
      method,
    };

    // Check rate limit
    const result = await this.rateLimitService.checkRateLimit(rateLimitContext);

    // Set rate limit headers
    response.setHeader('X-RateLimit-Limit', result.limit);
    response.setHeader('X-RateLimit-Remaining', result.remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      Math.floor(result.resetAt.getTime() / 1000),
    );

    if (!result.allowed) {
      // Log the violation (fire and forget)
      this.rateLimitService
        .logViolation({
          userId,
          ipAddress,
          route,
          method,
          tier: userTier,
          limit: result.limit,
          userAgent: request.headers['user-agent'],
        })
        .catch((err) =>
          console.error('Failed to log rate limit violation:', err),
        );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment the request count (fire and forget)
    this.rateLimitService.incrementRequest(rateLimitContext).catch((err) => {
      // Log error but don't block the request
      console.error('Failed to increment rate limit counter:', err);
    });

    return true;
  }

  /**
   * Determine user tier from request headers or other signals
   */
  private determineTierFromRequest(request: any): UserTier {
    // Check for admin header
    if (request.headers['x-admin'] === 'true') {
      return 'admin';
    }

    // Check for tier header (if provided by auth system)
    const tierHeader = request.headers['x-user-tier'];
    if (
      tierHeader &&
      ['guest', 'standard', 'premium', 'admin'].includes(tierHeader)
    ) {
      return tierHeader as UserTier;
    }

    // Default to guest for unauthenticated requests
    return 'guest';
  }

  /**
   * Determine risk level from request or user context
   */
  private determineRiskLevel(request: any): RiskLevel | undefined {
    // Check for risk level header (if provided by auth system)
    const riskHeader = request.headers['x-risk-level'];
    if (riskHeader && ['low', 'medium', 'high'].includes(riskHeader)) {
      return riskHeader as RiskLevel;
    }

    // Check user object for risk level
    if (request.user?.riskLevel) {
      return request.user.riskLevel;
    }

    // Could also check device trust level, IP reputation, etc.
    // For now, return undefined (will match rules with null riskLevel)
    return undefined;
  }
}
