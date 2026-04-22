import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from '../../users/entities/wallet.entity';
import { PortfolioService } from '../services/portfolio.service';

/**
 * PortfolioSnapshotJob
 *
 * Daily cron that persists a PortfolioSnapshot per user.
 */
@Injectable()
export class PortfolioSnapshotJob {
  private readonly logger = new Logger(PortfolioSnapshotJob.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly portfolioService: PortfolioService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async takeSnapshots(): Promise<void> {
    this.logger.log('Starting daily portfolio snapshot job');

    // Get distinct user IDs with active wallets
    const rows: { userId: string }[] = await this.walletRepo
      .createQueryBuilder('w')
      .select('DISTINCT w.userId', 'userId')
      .where('w.status = :status', { status: 'active' })
      .getRawMany();

    let success = 0;
    let failed = 0;

    for (const { userId } of rows) {
      try {
        await this.portfolioService.takeSnapshot(userId);
        success++;
      } catch (error) {
        this.logger.error(`Failed to snapshot portfolio for user ${userId}:`, error);
        failed++;
      }
    }

    this.logger.log(`Portfolio snapshot complete: ${success} succeeded, ${failed} failed`);
  }
}
