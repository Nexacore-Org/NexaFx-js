import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FxForwardContractService } from '../services/fx-forward-contract.service';

@Injectable()
export class FxForwardSettlementJob {
  private readonly logger = new Logger(FxForwardSettlementJob.name);

  constructor(private readonly forwardService: FxForwardContractService) {}

  /** Runs every hour — settles contracts whose maturity date has passed */
  @Cron(CronExpression.EVERY_HOUR)
  async settleMaturedContracts(): Promise<void> {
    this.logger.log('Forward settlement job started');
    const due = await this.forwardService.findDueContracts();

    let settled = 0;
    for (const contract of due) {
      try {
        await this.forwardService.settle(contract);
        settled++;
      } catch (err) {
        this.logger.error(`Failed to settle contract ${contract.id}`, (err as Error).stack);
      }
    }

    this.logger.log(`Forward settlement job complete — settled: ${settled}/${due.length}`);
  }
}
