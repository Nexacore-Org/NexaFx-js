import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class SecurityHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();

    // Security headers per OWASP recommendations
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()',
    );
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
    );

    return next.handle().pipe(
      tap(() => {
        // Add rate limit headers if available
        const request = context.switchToHttp().getRequest();
        if (request.rateLimit) {
          response.setHeader('X-RateLimit-Limit', request.rateLimit.limit);
          response.setHeader(
            'X-RateLimit-Remaining',
            request.rateLimit.remaining,
          );
          response.setHeader('X-RateLimit-Reset', request.rateLimit.reset);
        }
      }),
    );
  }
}
