import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { TransactionProcessor } from './transaction.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.TRANSACTION,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  providers: [TransactionProcessor],
  exports: [BullModule],
})
export class TransactionQueueModule {}
