import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import {
  QUEUE_NAMES,
  getDefaultJobOptions,
} from '../queues/queue.constants';
import { EmailQueueService } from './email-queue.service';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

@Module({
  providers: [MailService, EmailQueueService],
  exports: [MailService, EmailQueueService],
})
export class MailModule {}

@Module({
  imports: [
    MailModule,
    BullModule.registerQueue({
      name: QUEUE_NAMES.EMAIL,
      defaultJobOptions: getDefaultJobOptions(),
    }),
  ],
  providers: [MailProcessor],
  exports: [BullModule],
})
export class MailQueueModule {}
