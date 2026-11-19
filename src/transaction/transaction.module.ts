import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES, getDefaultJobOptions } from '../queues/queue.constants';
import { TransactionProcessor } from './transaction.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.TRANSACTION,
      defaultJobOptions: getDefaultJobOptions(),
    }),
  ],
  providers: [TransactionProcessor],
  exports: [BullModule],
})
export class TransactionQueueModule {}
