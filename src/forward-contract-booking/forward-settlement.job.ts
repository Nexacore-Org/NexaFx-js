import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ForwardContractService } from '../services/forward-contract.service';

@Injectable()
export class ForwardSettlementJob {
  private readonly logger = new Logger(ForwardSettlementJob.name);

  constructor(private readonly forwardService: ForwardContractService) {}

  /**
   * Runs every day at 00:05 UTC to settle all ACTIVE contracts
   * whose maturityDate has passed.
   *
   * Override the cron expression via env FORWARD_SETTLEMENT_CRON
   * (NestJS schedule does not support dynamic cron strings in @Cron,
   * so for custom schedules inject SchedulerRegistry and add a job
   * dynamically in onModuleInit instead).
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'forward-settlement',
    timeZone: 'UTC',
  })
  async handleSettlement(): Promise<void> {
    this.logger.log('[ForwardSettlementJob] Starting scheduled settlement run...');

    try {
      const result = await this.forwardService.settleDueContracts();
      this.logger.log(
        `[ForwardSettlementJob] Completed — settled: ${result.settled}, errors: ${result.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `[ForwardSettlementJob] Unhandled error during settlement run: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
