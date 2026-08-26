import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueMonitorController } from './queue-monitor.controller';
import { QUEUE_NAMES } from './queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATION },
      { name: QUEUE_NAMES.TRANSACTION },
    ),
  ],
  controllers: [QueueMonitorController],
})
export class QueuesModule {}
