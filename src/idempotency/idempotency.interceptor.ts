import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of, defer } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

interface IdempotencyResponsePayload {
  statusCode: number;
  body: unknown;
}

interface IdempotencyRequest {
  idempotencyKey?: string;
  requestHash?: string;
  idempotencyResponse?: IdempotencyResponsePayload;
}

interface IdempotencyHttpResponse {
  statusCode: number;
  status(code: number): IdempotencyHttpResponse;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotencyRequest>();
    const response = http.getResponse<IdempotencyHttpResponse>();

    // Return cached response immediately if it exists
    if (request.idempotencyResponse) {
      response.status(request.idempotencyResponse.statusCode);
      return of<unknown>(request.idempotencyResponse.body);
    }

    return next.handle().pipe(
      switchMap((data: unknown) => {
        const requestHash = request.requestHash;

        if (!request.idempotencyKey || !requestHash) {
          return of(data);
        }

        // defer(): a *synchronous* throw from store() happens inside the
        // observable, so catchError sees it. Persisting the replay record must
        // never turn a request that already succeeded into a 500.
        return defer(() =>
          this.idempotencyService.store(
            request.idempotencyKey as string,
            requestHash,
            data,
            response.statusCode,
          ),
        ).pipe(
          map(() => data),
          catchError((error: unknown) => {
            this.logger.error(
              'Failed to persist idempotency response',
              error as Error,
            );
            return of(data);
          }),
        );
      }),
    );
  }
}
