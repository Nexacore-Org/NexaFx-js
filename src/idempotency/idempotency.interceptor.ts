import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
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
      mergeMap(async (data: unknown): Promise<unknown> => {
        const requestHash = request.requestHash;

        if (request.idempotencyKey && requestHash) {
          await this.idempotencyService.store(
            request.idempotencyKey,
            requestHash,
            data,
            response.statusCode,
          );
        }
        return data;
      }),
    );
  }
}
