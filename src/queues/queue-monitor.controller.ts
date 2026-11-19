import {
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { QUEUE_NAMES, QueueName } from './queue.constants';

const DEFAULT_FAILED_PAGE_SIZE = 50;
const MAX_FAILED_PAGE_SIZE = 200;

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

@Controller('queues')
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
export class QueueMonitorController {
  constructor(
    @Inject(getQueueToken(QUEUE_NAMES.DEFAULT))
    private readonly defaultQueue: Queue,
    @Inject(getQueueToken(QUEUE_NAMES.EMAIL))
    private readonly emailQueue: Queue,
    @Inject(getQueueToken(QUEUE_NAMES.NOTIFICATION))
    private readonly notificationQueue: Queue,
    @Inject(getQueueToken(QUEUE_NAMES.TRANSACTION))
    private readonly transactionQueue: Queue,
    @Inject(getQueueToken(QUEUE_NAMES.WEBHOOKS))
    private readonly webhooksQueue: Queue,
    @Inject(getQueueToken(QUEUE_NAMES.STATEMENTS))
    private readonly statementsQueue: Queue,
    @Inject(getQueueToken(QUEUE_NAMES.ADMIN_EXPORTS))
    private readonly adminExportsQueue: Queue,
  ) {}

  private queues(): Record<QueueName, Queue> {
    return {
      [QUEUE_NAMES.DEFAULT]: this.defaultQueue,
      [QUEUE_NAMES.EMAIL]: this.emailQueue,
      [QUEUE_NAMES.NOTIFICATION]: this.notificationQueue,
      [QUEUE_NAMES.TRANSACTION]: this.transactionQueue,
      [QUEUE_NAMES.WEBHOOKS]: this.webhooksQueue,
      [QUEUE_NAMES.STATEMENTS]: this.statementsQueue,
      [QUEUE_NAMES.ADMIN_EXPORTS]: this.adminExportsQueue,
    };
  }

  private getQueue(name: string): Queue {
    const queue = this.queues()[name as QueueName];
    if (!queue) throw new NotFoundException(`Queue "${name}" not found`);
    return queue;
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
  async getFailed(
    @Param('name') name: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const queue = this.getQueue(name);
    const pageNumber = positiveInt(page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = positiveInt(limit, DEFAULT_FAILED_PAGE_SIZE, MAX_FAILED_PAGE_SIZE);
    const start = (pageNumber - 1) * pageSize;
    const [jobs, total] = await Promise.all([
      queue.getFailed(start, start + pageSize - 1),
      queue.getFailedCount(),
    ]);
    return {
      items: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
        data: job.data,
      })),
      total,
      page: pageNumber,
      limit: pageSize,
    };
  }

  @Post(':name/retry/:jobId')
  async retryFailed(
    @Param('name') name: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.getQueue(name).getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found in queue "${name}"`);
    }
    await job.retry();
    return { id: job.id, retried: true };
  }

  @Delete(':name/failed')
  async cleanFailed(
    @Param('name') name: string,
    @Query('limit') limit?: string,
  ) {
    const maxJobs = positiveInt(limit, MAX_FAILED_PAGE_SIZE, MAX_FAILED_PAGE_SIZE);
    const removed = await this.getQueue(name).clean(0, 'failed', maxJobs);
    return { removed: removed.length, ids: removed.map((job) => job.id) };
  }
}
