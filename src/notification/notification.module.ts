import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../queues/queue.constants';
import { NotificationProcessor } from './notification.processor';
import { PushModule } from '../notifications/push/push.module';

@Module({
  imports: [
    PushModule,
    BullModule.registerQueue({
      name: QUEUE_NAMES.NOTIFICATION,
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
  providers: [NotificationProcessor],
  exports: [BullModule],
})
export class NotificationQueueModule {}
