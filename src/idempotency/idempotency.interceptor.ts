import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Return cached response immediately if it exists
    if (request.idempotencyResponse) {
      response.status(request.idempotencyResponse.statusCode);
      return of(request.idempotencyResponse.body);
    }

    return next.handle().pipe(
      tap(async (data) => {
        // Cache response after successful commit (post-response)
        if (request.idempotencyKey) {
          await this.idempotencyService.store(
            request.idempotencyKey,
            request.requestHash,
            data,
            response.statusCode,
          );
        }
      }),
    );
  }
}
