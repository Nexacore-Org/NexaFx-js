import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { RetryJobEntity } from './entities/retry-job.entity';
import { RetryService } from './retry.services';
import { RetryWorker } from './retry.worker';
import { AdminRetryController } from './retry-admin.controller';
import { TransactionRetryListener } from './listeners/transaction-retry.listener';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RetryJobEntity]),
    ScheduleModule.forRoot(),
    TransactionsModule,
  ],
  controllers: [AdminRetryController],
  providers: [RetryService, RetryWorker, TransactionRetryListener],
  exports: [RetryService],
})
export class RetryModule {}
