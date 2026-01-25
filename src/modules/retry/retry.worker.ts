import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RetryService } from './retry.service';

@Injectable()
export class RetryWorker {
  constructor(private readonly retryService: RetryService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleRetries() {
    const dueJobs = await this.retryService.findDueJobs(50);

    for (const job of dueJobs) {
      await this.retryService.runJob(job.id);
    }
  }
}
