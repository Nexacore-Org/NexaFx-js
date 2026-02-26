// src/modules/audit/audit.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();

    return next.handle().pipe(
      tap((response) => {
        // Record the event: Input (request) + Output (response) + Timestamp
        this.auditService.recordEvent({
          type: request.url,
          payload: request.body,
          result: response,
          timestamp: startTime,
        });
      }),
    );
  }
}