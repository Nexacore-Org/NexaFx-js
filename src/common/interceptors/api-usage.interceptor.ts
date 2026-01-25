import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiUsageService } from '../../modules/analytics/services/api-usage.service';

@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly apiUsageService: ApiUsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const startTime = Date.now();
    const route = request.route?.path || request.url;
    const method = request.method;
    const userAgent = request.headers['user-agent'];
    const ipAddress =
      request.ip ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress;

    // Extract userId from request if available (e.g., from JWT token)
    const userId = (request as any).user?.id;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode;

          // Fire-and-forget logging to avoid impacting response times
          setImmediate(() => {
            this.apiUsageService.logRequest({
              route,
              method,
              userId,
              durationMs,
              statusCode,
              userAgent,
              ipAddress,
            });
          });
        },
        error: () => {
          const durationMs = Date.now() - startTime;
          const statusCode = response.statusCode || 500;

          setImmediate(() => {
            this.apiUsageService.logRequest({
              route,
              method,
              userId,
              durationMs,
              statusCode,
              userAgent,
              ipAddress,
            });
          });
        },
      }),
    );
  }
}
