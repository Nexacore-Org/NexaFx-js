// src/modules/transactions/services/transactions.service.ts
// ─── ADD to your existing TransactionsService ─────────────────────────────────
//
// 1. Inject RoundUpService in the constructor
// 2. Call triggerRoundUpForLinkedGoals() at the end of your commit/complete method
//
// Constructor addition:
//
//   constructor(
//     ...existing deps...
//     private readonly roundUpService: RoundUpService,
//   ) {}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoundUpService } from '../../goals/services/round-up.service';

// ─── Stub showing the integration point ──────────────────────────────────────

@Injectable()
export class TransactionsServiceRoundUpHook {
  private readonly logger = new Logger('TransactionsService');

  constructor(
    private readonly roundUpService: RoundUpService,
  ) {}

  /**
   * Call this AFTER the transaction row has been successfully committed to DB.
   *
   * Example usage inside your existing completeTransaction() method:
   *
   *   async completeTransaction(txId: string): Promise<Transaction> {
   *     const tx = await this.txRepo.save({ ...transaction, status: 'completed' });
   *     // ↓ fire-and-forget — never awaited, never blocks
   *     this.triggerRoundUpForLinkedGoals(tx);
   *     return tx;
   *   }
   */
  triggerRoundUpForLinkedGoals(transaction: {
    id: string;
    walletId: string;
    amount: number;
    currency: string;
  }): void {
    // Fetch all goals that have round-up enabled and are linked to this wallet.
    // This is intentionally async — do NOT await it.
    this.findGoalsAndTrigger(transaction).catch((err) => {
      this.logger.error(
        `Failed to trigger round-up for tx ${transaction.id}: ${err?.message}`,
        err?.stack,
      );
    });
  }

  private async findGoalsAndTrigger(transaction: {
    id: string;
    walletId: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    // TODO: inject GoalRepository and run:
    //
    //   const goals = await this.goalRepo.find({
    //     where: {
    //       linkedWalletId: transaction.walletId,
    //       roundUpEnabled: true,
    //       isCompleted: false,
    //     },
    //   });
    //
    //   for (const goal of goals) {
    //     this.roundUpService.triggerRoundUpAsync({
    //       goalId: goal.id,
    //       transactionId: transaction.id,
    //       transactionAmount: transaction.amount,
    //       roundUpUnit: goal.roundUpUnit!,
    //       linkedWalletId: transaction.walletId,
    //       currency: transaction.currency,
    //     });
    //   }

    this.logger.debug(
      `Round-up hook called for tx ${transaction.id} (wallet ${transaction.walletId})`,
    );
  }
}
