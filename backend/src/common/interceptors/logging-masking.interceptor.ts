import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingMaskingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingMaskingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, query, params } = request;

    // Log request with masked sensitive data
    const maskedBody = this.maskSensitiveData(body);
    const maskedQuery = this.maskSensitiveData(query);
    
    this.logger.log({
      message: 'Incoming Request',
      method,
      url,
      body: maskedBody,
      query: maskedQuery,
      params
    });

    return next.handle().pipe(
      tap(data => {
        // Log response with masked sensitive data
        const maskedResponse = this.maskSensitiveData(data);
        this.logger.log({
          message: 'Outgoing Response',
          method,
          url,
          response: maskedResponse
        });
      })
    );
  }

  private maskSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
    const masked = { ...data };

    for (const [key, value] of Object.entries(masked)) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        masked[key] = '***MASKED***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSensitiveData(value);
      }
    }

    return masked;
  }
}