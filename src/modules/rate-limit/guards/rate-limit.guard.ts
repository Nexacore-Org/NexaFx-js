import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService, RateLimitContext } from '../services/rate-limit.service';
import { RedisRateLimitService } from '../services/redis-rate-limit.service';
import { UserTier, RiskLevel } from '../entities/rate-limit-rule.entity';
import { TenantContextService } from '../../tenants/context/tenant-context.service';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RATE_LIMIT_SKIP_KEY = 'skipRateLimit';

export interface RateLimitOptions {
  tier?: UserTier;
  riskLevel?: RiskLevel;
  skipIf?: (context: ExecutionContext) => boolean;
}

export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);
export const RateLimit = (options?: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options || {});

// Configurable defaults (can be overridden via env or admin API)
const USER_LIMIT_PER_MIN = 100;
const IP_LIMIT_PER_MIN = 200;
const WINDOW_MS = 60_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimitService: RateLimitService,
    private readonly reflector: Reflector,
    private readonly redisRateLimit: RedisRateLimitService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(RATE_LIMIT_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipRateLimit) return true;

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (options?.skipIf?.(context)) return true;

    const userId: string | undefined = request.user?.id || request.user?.userId;
    const userTier: UserTier = options?.tier || request.user?.tier || this.determineTier(request);
    const riskLevel: RiskLevel | undefined = options?.riskLevel || request.user?.riskLevel || this.determineRiskLevel(request);
    const ipAddress: string =
      request.ip ||
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.connection?.remoteAddress ||
      'unknown';
    const route: string = request.route?.path || request.url;
    const method: string = request.method;
    const tenantId = this.tenantContext.getTenantId();
    const redisPrefix = tenantId ? `tenant:${tenantId}:` : '';

    let allowed: boolean;
    let remaining: number;
    let resetAt: Date;
    let limit: number;
    let retryAfterSecs: number;

    if (this.redisRateLimit.isAvailable()) {
      // Redis sliding window — per-user AND per-IP, both must pass
      const [userResult, ipResult] = await Promise.all([
        userId
          ? this.redisRateLimit.checkAndIncrement(`${redisPrefix}rl:user:${userId}:${route}`, USER_LIMIT_PER_MIN, WINDOW_MS)
          : Promise.resolve({ allowed: true, remaining: USER_LIMIT_PER_MIN, retryAfterMs: 0 }),
        this.redisRateLimit.checkAndIncrement(`${redisPrefix}rl:ip:${ipAddress}:${route}`, IP_LIMIT_PER_MIN, WINDOW_MS),
      ]);

      allowed = userResult.allowed && ipResult.allowed;
      remaining = Math.min(userResult.remaining, ipResult.remaining);
      const retryAfterMs = Math.max(userResult.retryAfterMs, ipResult.retryAfterMs);
      retryAfterSecs = Math.ceil(retryAfterMs / 1000);
      limit = userId ? USER_LIMIT_PER_MIN : IP_LIMIT_PER_MIN;
      resetAt = new Date(Date.now() + (retryAfterMs || WINDOW_MS));
    } else {
      // DB fallback
      const rateLimitContext: RateLimitContext = {
        tenantId,
        userId,
        tier: userTier,
        riskLevel,
        ipAddress,
        route,
        method,
      };
      const result = await this.rateLimitService.checkRateLimit(rateLimitContext);
      allowed = result.allowed;
      remaining = result.remaining;
      resetAt = result.resetAt;
      limit = result.limit;
      retryAfterSecs = Math.ceil((resetAt.getTime() - Date.now()) / 1000);

      if (allowed) {
        this.rateLimitService.incrementRequest(rateLimitContext).catch(() => {});
      }
    }

    // Standard rate-limit headers
    response.setHeader('X-RateLimit-Limit', limit);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader('X-RateLimit-Reset', Math.floor(resetAt.getTime() / 1000));

    if (!allowed) {
      response.setHeader('Retry-After', retryAfterSecs);

      this.rateLimitService
        .logViolation({ userId, ipAddress, route, method, tier: userTier, limit, userAgent: request.headers['user-agent'] })
        .catch(() => {});

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: retryAfterSecs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private determineTier(request: any): UserTier {
    if (request.headers['x-admin'] === 'true') return 'admin';
    const h = request.headers['x-user-tier'];
    if (h && ['guest', 'standard', 'premium', 'admin'].includes(h)) return h as UserTier;
    return 'guest';
  }

  private determineRiskLevel(request: any): RiskLevel | undefined {
    const h = request.headers['x-risk-level'];
    if (h && ['low', 'medium', 'high'].includes(h)) return h as RiskLevel;
    return request.user?.riskLevel;
  }
}
