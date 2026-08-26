import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    let route = 'unmatched';
    if (req.route?.path) {
      route = String(req.route.path);
    } else if (req.path) {
      route = req.path
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
        .replace(/\/\d+/g, '/:id');
    }

    return next.handle().pipe(
      tap({
        next: () => this.record(method, route, res.statusCode, start),
        error: () => this.record(method, route, res.statusCode || 500, start),
      }),
    );
  }

  private record(
    method: string,
    route: string,
    status: number,
    start: number,
  ): void {
    this.metricsService.recordHttpRequest(
      method,
      route,
      status,
      Date.now() - start,
    );
  }
}
