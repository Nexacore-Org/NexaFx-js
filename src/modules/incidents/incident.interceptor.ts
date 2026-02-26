// src/modules/incidents/incident.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import { IncidentService } from './incident.service';

@Injectable()
export class IncidentInterceptor implements NestInterceptor {
  constructor(private incidentService: IncidentService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((err) => {
        // Report every 5xx or system crash to the engine
        if (err.status >= 500 || !err.status) {
          this.incidentService.reportError(err);
        }
        return throwError(() => err);
      }),
    );
  }
}