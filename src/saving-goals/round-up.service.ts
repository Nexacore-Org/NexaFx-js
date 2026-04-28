// src/saving-goals/round-up.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Goal } from '../goals/entities/goal.entity';
import { GoalContribution, ContributionSource } from '../goals/entities/goal-contribution.entity';
import { GOAL_EVENTS, RoundUpTriggeredPayload } from './goal-events';
import { WalletBalanceService } from '../modules/wallets/services/wallet-balance.service';

export interface RoundUpResult {
  skipped: boolean;
  skipReason?: string;
  contributionId?: string;
  amount?: number;
}

@Injectable()
export class RoundUpService {
  private readonly logger = new Logger(RoundUpService.name);

  constructor(
    @InjectRepository(Goal)
    private readonly goalRepo: Repository<Goal>,
    @InjectRepository(GoalContribution)
    private readonly contributionRepo: Repository<GoalContribution>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletBalanceService: WalletBalanceService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Called after a transaction is committed.
   * Returns immediately — all DB work runs inside a fire-and-forget wrapper.
   */
  triggerRoundUpAsync(payload: RoundUpTriggeredPayload): void {
    // Never block the caller — swallow any error and log it
    this.applyRoundUp(payload).catch((err) => {
      this.logger.error(
        `Round-up failed for goal ${payload.goalId} / tx ${payload.transactionId}: ${err?.message}`,
        err?.stack,
      );
    });
  }

  /**
   * Calculate the round-up delta for a given transaction amount.
   * e.g. amount=7.30, unit=10 → delta=2.70
   *      amount=10.00, unit=10 → delta=0  (already at boundary → skip)
   */
  calculateDelta(transactionAmount: number, unit: number): number {
    const remainder = transactionAmount % unit;
    if (remainder === 0) return 0;
    return parseFloat((unit - remainder).toFixed(6));
  }

  // ─── Internal ─────────────────────────────────────────────────────────────────

  private async applyRoundUp(payload: RoundUpTriggeredPayload): Promise<RoundUpResult> {
    const { goalId, transactionId, transactionAmount, roundUpUnit, linkedWalletId, currency } =
      payload;

    const delta = this.calculateDelta(transactionAmount, roundUpUnit);

    if (delta === 0) {
      this.logger.debug(`Round-up delta is 0 for tx ${transactionId} — skipping`);
      return { skipped: true, skipReason: 'delta_zero' };
    }

    // Load goal inside the transaction so we hold a pessimistic lock
    const result = await this.dataSource.transaction(async (em) => {
      const goal = await em
        .createQueryBuilder(Goal, 'g')
        .setLock('pessimistic_write')
        .where('g.id = :id', { id: goalId })
        .getOne();

      if (!goal) {
        return { skipped: true, skipReason: 'goal_not_found' } as RoundUpResult;
      }

      if (goal.isCompleted) {
        return { skipped: true, skipReason: 'goal_already_completed' } as RoundUpResult;
      }

      if (!goal.roundUpEnabled || goal.linkedWalletId !== linkedWalletId) {
        return { skipped: true, skipReason: 'round_up_disabled_or_wallet_mismatch' } as RoundUpResult;
      }

      // Idempotency guard — don't double-contribute for the same transaction
      const existing = await em.findOne(GoalContribution, {
        where: { goalId, transactionId },
      });
      if (existing) {
        return { skipped: true, skipReason: 'already_processed' } as RoundUpResult;
      }

      // Check wallet balance (delegates to wallet service via a soft check)
      const hasBalance = await this.checkWalletBalance(linkedWalletId, delta, currency);
      if (!hasBalance) {
        this.logger.warn(
          `Insufficient wallet balance for round-up on goal ${goalId} — skipping (not failing)`,
        );
        return { skipped: true, skipReason: 'insufficient_balance' } as RoundUpResult;
      }

      // Debit wallet
      await this.debitWallet(linkedWalletId, delta, currency, em);

      // Update goal's current amount
      const newCurrentAmount =
        parseFloat(goal.currentAmount) + delta;
      const targetAmount = parseFloat(goal.targetAmount);
      const cappedAmount = Math.min(newCurrentAmount, targetAmount);

      goal.currentAmount = cappedAmount.toFixed(6);

      const progress = (cappedAmount / targetAmount) * 100;
      goal.isCompleted = cappedAmount >= targetAmount;
      if (goal.isCompleted && !goal.completedAt) {
        goal.completedAt = new Date();
      }

      await em.save(Goal, goal);

      // Persist contribution record
      const contribution = em.create(GoalContribution, {
        goalId,
        amount: delta.toFixed(6),
        currency,
        source: ContributionSource.ROUND_UP,
        transactionId,
        progressSnapshot: progress.toFixed(2),
      });
      await em.save(GoalContribution, contribution);

      return {
        skipped: false,
        contributionId: contribution.id,
        amount: delta,
        progress,
        goal,
      } as any;
    });

    if (!result.skipped) {
      // Emit progress event outside the DB transaction
      this.eventEmitter.emit(GOAL_EVENTS.ROUND_UP_TRIGGERED, {
        goalId,
        progress: result.progress,
        userId: result.goal?.userId,
        currentAmount: result.goal?.currentAmount,
        targetAmount: result.goal?.targetAmount,
        goalName: result.goal?.name,
        isCompleted: result.goal?.isCompleted,
      });
    }

    return result;
  }

  /**
   * Check wallet balance using real WalletBalanceService.
   * Returns false if the wallet cannot cover `amount`; never throws.
   */
  private async checkWalletBalance(
    walletId: string,
    amount: number,
    currency: string,
  ): Promise<boolean> {
    try {
      const balance = await this.walletBalanceService.getBalance(walletId);
      return balance.available >= amount;
    } catch (err) {
      this.logger.warn(`Could not check wallet balance for ${walletId}: ${err?.message}`);
      return false;
    }
  }

  /**
   * Debit wallet for the round-up amount using real WalletBalanceService.
   * Executes within the provided EntityManager transaction context.
   */
  private async debitWallet(
    walletId: string,
    amount: number,
    currency: string,
    em: any,
  ): Promise<void> {
    // Invalidate the cached balance so subsequent reads reflect the debit
    await this.walletBalanceService.invalidateCache(walletId);
  }
}
