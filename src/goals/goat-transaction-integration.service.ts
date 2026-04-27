import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal, GoalStatus } from './entities/goal.entity';
import { WalletBalanceService } from '../modules/wallets/services/wallet-balance.service';
import { Inject, forwardRef } from '@nestjs/common';

/**
 * This service handles the integration between goals and wallet transactions.
 * It should be called by your transaction service whenever a transaction occurs.
 */
@Injectable()
export class GoalTransactionIntegrationService {
  constructor(
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
    @Inject(forwardRef(() => WalletBalanceService))
    private readonly walletBalanceService: WalletBalanceService,
  ) {}

  /**
   * Update goal progress based on a wallet transaction
   * Call this method from your transaction service after a transaction is processed
   */
  async updateGoalsFromTransaction(
    userId: string,
    walletId: string,
    amount: number,
    transactionType: 'credit' | 'debit',
  ): Promise<void> {
    // Find all active goals linked to this wallet
    const linkedGoals = await this.goalRepository.find({
      where: {
        userId,
        linkedWalletId: walletId,
        status: GoalStatus.ACTIVE,
      },
    });

    if (linkedGoals.length === 0) {
      return;
    }

    // Update each goal's progress by fetching real wallet balance
    for (const goal of linkedGoals) {
      try {
        // Fetch real balance from WalletBalanceService
        const walletBalance = await this.walletBalanceService.getBalance(walletId);
        goal.currentAmount = Math.min(walletBalance.available, goal.targetAmount);

        // Auto-complete if target is reached
        if (goal.currentAmount >= goal.targetAmount) {
          goal.status = GoalStatus.COMPLETED;
        }

        await this.goalRepository.save(goal);
      } catch (error) {
        console.error(`Failed to sync goal ${goal.id} with wallet balance:`, error);
      }
    }
  }

  /**
   * Sync goal progress with current wallet balance
   * Use this for periodic synchronization or manual refresh
   */
  async syncGoalWithWalletBalance(
    goalId: string,
  ): Promise<Goal> {
    const goal = await this.goalRepository.findOne({
      where: { id: goalId },
    });

    if (!goal || !goal.linkedWalletId) {
      return goal;
    }

    try {
      // Fetch real balance from WalletBalanceService
      const walletBalance = await this.walletBalanceService.getBalance(goal.linkedWalletId);
      goal.currentAmount = Math.min(walletBalance.available, goal.targetAmount);

      // Auto-complete if target is reached
      if (goal.currentAmount >= goal.targetAmount && goal.status === GoalStatus.ACTIVE) {
        goal.status = GoalStatus.COMPLETED;
      }
    } catch (error) {
      console.error(`Failed to sync goal ${goalId} with wallet balance:`, error);
    }

    return this.goalRepository.save(goal);
  }

  /**
   * Get all goals that should be tracked for a specific wallet
   */
  async getActiveGoalsForWallet(userId: string, walletId: string): Promise<Goal[]> {
    return this.goalRepository.find({
      where: {
        userId,
        linkedWalletId: walletId,
        status: GoalStatus.ACTIVE,
      },
    });
  }
}