import { Injectable, Logger } from '@nestjs/common';
import { AmlService, TransactionRecord } from '../../aml/aml.service';

/** Runs the persisted AML rules; a failing rule is logged and never propagates (issue #1386). */
@Injectable()
export class RiskEngineService {
  private readonly logger = new Logger(RiskEngineService.name);

  constructor(private readonly aml: AmlService) {}

  async evaluate(userId: string, recentTxs: TransactionRecord[]): Promise<void> {
    const rules: Array<[string, () => Promise<void>]> = [
      ['structuring', () => this.aml.checkStructuring(userId, recentTxs)],
      ['smurfing', () => this.aml.checkSmurfing(userId, recentTxs)],
      ['velocityBurst', () => this.aml.checkVelocityBurst(userId, recentTxs)],
    ];
    for (const [name, run] of rules) {
      try {
        await run();
      } catch (err) {
        this.logger.error(`AML rule ${name} failed for user ${userId}: ${(err as Error).message}`);
      }
    }
  }
}
