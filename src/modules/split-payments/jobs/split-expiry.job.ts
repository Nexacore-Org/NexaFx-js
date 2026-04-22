import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SplitPaymentService } from '../services/split-payment.service';

@Injectable()
export class SplitExpiryJob {
  private readonly logger = new Logger(SplitExpiryJob.name);

  constructor(private readonly splitPaymentService: SplitPaymentService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiredSplits(): Promise<void> {
    this.logger.log('Running split payment expiry check');
    try {
      await this.splitPaymentService.handleExpiry();
    } catch (error) {
      this.logger.error('Split expiry job failed:', error);
    }
  }
}
