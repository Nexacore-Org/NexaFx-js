import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { JsonLogger } from '../logging/json-logger';
import { scrubPII } from '../utils/pii-scrubber';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: JsonLogger,
    private readonly context: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const start = Date.now();

    const { method, url, body, params, query } = req;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;

        this.logger.log('HTTP Request', {
          method,
          path: url,
          statusCode: res.statusCode,
          duration,
          userId: this.context.getUserId(),
          params: scrubPII(params),
          query: scrubPII(query),
          body: scrubPII(body),
        });
      }),
    );
  }
}