import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal, GoalStatus } from '../entities/goal.entity';
import { GoalTransactionIntegrationService } from '../goat-transaction-integration.service';
import { Inject, forwardRef } from '@nestjs/common';

/**
 * Daily sync job that re-syncs all active wallet-linked goals to their current real balance
 */
@Injectable()
export class GoalBalanceSyncJob {
  private readonly logger = new Logger(GoalBalanceSyncJob.name);

  constructor(
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
    @Inject(forwardRef(() => GoalTransactionIntegrationService))
    private readonly goalTransactionIntegrationService: GoalTransactionIntegrationService,
  ) {}

  /**
   * Runs daily at 2 AM UTC to sync all active wallet-linked goals
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async syncAllWalletLinkedGoals(): Promise<void> {
    this.logger.log('Starting daily wallet-linked goals sync...');
    
    try {
      // Find all active goals that are linked to wallets
      const walletLinkedGoals = await this.goalRepository.find({
        where: {
          status: GoalStatus.ACTIVE,
          linkedWalletId: { $ne: null } as any, // TypeORM where clause for non-null
        },
        select: ['id', 'userId', 'linkedWalletId'],
      });

      if (walletLinkedGoals.length === 0) {
        this.logger.log('No wallet-linked goals found for sync');
        return;
      }

      this.logger.log(`Found ${walletLinkedGoals.length} wallet-linked goals to sync`);

      let successCount = 0;
      let errorCount = 0;

      // Sync each goal individually to handle errors gracefully
      for (const goal of walletLinkedGoals) {
        try {
          await this.goalTransactionIntegrationService.syncGoalWithWalletBalance(goal.id);
          successCount++;
        } catch (error) {
          errorCount++;
          this.logger.error(`Failed to sync goal ${goal.id}:`, error.message);
        }
      }

      this.logger.log(
        `Daily sync completed: ${successCount} successful, ${errorCount} failed`,
      );
    } catch (error) {
      this.logger.error('Daily wallet-linked goals sync failed:', error.stack);
    }
  }

  /**
   * Manual trigger for testing or admin use
   */
  async triggerManualSync(): Promise<{ success: number; failed: number; total: number }> {
    this.logger.log('Manual wallet-linked goals sync triggered...');
    
    const walletLinkedGoals = await this.goalRepository.find({
      where: {
        status: GoalStatus.ACTIVE,
        linkedWalletId: { $ne: null } as any,
      },
      select: ['id', 'userId', 'linkedWalletId'],
    });

    let successCount = 0;
    let errorCount = 0;

    for (const goal of walletLinkedGoals) {
      try {
        await this.goalTransactionIntegrationService.syncGoalWithWalletBalance(goal.id);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger.error(`Failed to sync goal ${goal.id}:`, error.message);
      }
    }

    return {
      success: successCount,
      failed: errorCount,
      total: walletLinkedGoals.length,
    };
  }
}
