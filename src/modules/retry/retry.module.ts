import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { RetryJobEntity } from './entities/retry-job.entity';
import { RetryService } from './retry.services';
import { RetryWorker } from './retry.worker';
import { AdminRetryController } from './retry-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RetryJobEntity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AdminRetryController],
  providers: [RetryService, RetryWorker],
  exports: [RetryService],
})
export class RetryModule {}
