import {
  applyDecorators,
  SetMetadata,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { IDEMPOTENCY_KEY } from './constants';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';

export { IDEMPOTENCY_KEY } from './constants';

export const Idempotent = () => SetMetadata(IDEMPOTENCY_KEY, true);

/**
 * One decorator for every route that moves or locks money: it makes the
 * `Idempotency-Key` header mandatory, enables replay handling and documents the
 * header in Swagger. Keeping the three concerns together prevents a new
 * money-moving POST from silently missing one of them.
 */
export function IdempotentRoute() {
  return applyDecorators(
    Idempotent(),
    UseGuards(IdempotencyGuard),
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        'Unique key (16-255 characters) for this request; retries with the same key replay the original response.',
    }),
  );
}
