import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueMonitorController } from './queue-monitor.controller';
import { QUEUE_NAMES, getDefaultJobOptions } from './queue.constants';

/**
 * Registers every queue in one place so the monitor can resolve all of them.
 * Other modules may also register the queue they own; Bull keys providers by
 * queue token, so both registrations point at the same Redis queue.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      ...Object.values(QUEUE_NAMES).map((name) => ({
        name,
        defaultJobOptions: getDefaultJobOptions(),
      })),
    ),
  ],
  controllers: [QueueMonitorController],
})
export class QueuesModule {}
