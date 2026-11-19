import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './idempotency.entity';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyGuard } from './idempotency.guard';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyCleanupJob } from './cleanup.job';

// Global so controllers can use @IdempotentRoute() without each module having
// to re-import the guard and interceptor providers.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([IdempotencyKey]),
  ],
  providers: [
    IdempotencyService,
    IdempotencyGuard,
    IdempotencyInterceptor,
    IdempotencyCleanupJob,
  ],
  exports: [IdempotencyService, IdempotencyGuard, IdempotencyInterceptor],
})
export class IdempotencyModule {}
