import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Skip rate limiting for certain paths or conditions
    const skipPaths = ['/health', '/metrics'];
    return skipPaths.some(path => request.url.startsWith(path));
  }

  protected async getTracker(req: Request): Promise<string> {
    // Track by IP address and user agent for better security
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}-${userAgent}`;
  }

  protected getErrorMessage(context: ExecutionContext, throttlerLimitDetail: any): string {
    const request = context.switchToHttp().getRequest<Request>();
    const isAuthEndpoint = request.url.includes('/auth/');
    
    if (isAuthEndpoint) {
      return 'Too many authentication attempts. Please try again later.';
    }
    
    return `Rate limit exceeded. Try again in ${Math.ceil(throttlerLimitDetail.timeToReset / 1000)} seconds.`;
  }

  protected throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: any): void {
    const message = this.getErrorMessage(context, throttlerLimitDetail);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        error: 'Too Many Requests',
        retryAfter: Math.ceil(throttlerLimitDetail.timeToReset / 1000),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}