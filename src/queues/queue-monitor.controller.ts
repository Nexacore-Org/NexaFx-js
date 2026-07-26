import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { QUEUE_NAMES } from './queue.constants';

@Controller('queues')
export class QueueMonitorController {
  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TRANSACTION) private transactionQueue: Queue,
  ) {}

  private queues(): Record<string, Queue> {
    return {
      [QUEUE_NAMES.EMAIL]: this.emailQueue,
      [QUEUE_NAMES.NOTIFICATION]: this.notificationQueue,
      [QUEUE_NAMES.TRANSACTION]: this.transactionQueue,
    };
  }

  @Get()
  async getAll() {
    const stats: Record<string, object> = {};
    for (const [name, queue] of Object.entries(this.queues())) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      stats[name] = { waiting, active, completed, failed, delayed };
    }
    return stats;
  }

  @Get(':name/failed')
  async getFailed(@Param('name') name: string) {
    const queue = this.queues()[name];
    if (!queue) throw new NotFoundException(`Queue "${name}" not found`);
    const jobs = await queue.getFailed(0, 49);
    return jobs.map((j) => ({ id: j.id, name: j.name, failedReason: j.failedReason, timestamp: j.timestamp }));
  }
}
