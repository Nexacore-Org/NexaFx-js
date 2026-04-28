import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { ApiKeyService } from '../services/api-key.service';

@Injectable()
export class ApiKeyLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiKeyLoggingInterceptor.name);
  private readonly startTimeMap = new WeakMap<ExecutionContext, number>();

  constructor(private readonly apiKeyService: ApiKeyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode || 200;
        this.logUsage(context, statusCode, startTime);
      }),
      finalize(() => {
        // Ensure logging happens even on errors
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode || 500;
        this.logUsage(context, statusCode, startTime);
      }),
    );
  }

  private logUsage(context: ExecutionContext, statusCode: number, startTime: number): void {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.apiKey;

    if (!apiKey) return; // Not an API key request

    const latencyMs = Date.now() - startTime;
    const endpoint = `${request.method} ${request.path}`;
    const ipAddress = request.ip || request.connection?.remoteAddress;

    this.apiKeyService.logUsage(
      apiKey.id,
      endpoint,
      statusCode,
      latencyMs,
      ipAddress,
    ).catch(err => {
      this.logger.error(`Failed to log API key usage: ${err.message}`);
    });
  }
}
