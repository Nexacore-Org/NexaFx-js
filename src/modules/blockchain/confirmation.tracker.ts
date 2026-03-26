// src/modules/blockchain/confirmation.tracker.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainService } from './blockchain.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';

/**
 * ConfirmationTracker
 *
 * Tracks blockchain transaction confirmations and marks transactions as finalized
 * or orphaned based on blockchain state. Polls the blockchain at configurable intervals
 * and updates transaction status when confirmation requirements are met.
 */
@Injectable()
export class ConfirmationTracker {
  private readonly logger = new Logger(ConfirmationTracker.name);
  private readonly REQUIRED_CONFIRMATIONS = 12; // Configurable for safety
  private readonly POLL_INTERVAL_MS = 15000; // Poll every 15 seconds
  private activeTrackers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly blockchain: BlockchainService,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /**
   * Start tracking a transaction's confirmation status
   * Polls the blockchain until either:
   * 1. The transaction reaches required confirmations (finalized)
   * 2. The transaction is detected as orphaned/reorg'd
   */
  async trackTransaction(txHash: string): Promise<void> {
    // Clear any existing tracker for this tx hash
    this.stopTrackingTransaction(txHash);

    const checkStatus = setInterval(async () => {
      try {
        const receipt = await this.blockchain.getTransactionReceipt(txHash);

        // Handle Reorg: If receipt is no longer valid
        if (!receipt.isValid) {
          this.logger.warn(`Transaction ${txHash} detected as orphaned/reorg'd`);
          await this.markAsOrphaned(txHash);
          this.stopTrackingTransaction(txHash);
          return;
        }

        // Check if we have sufficient confirmations
        if (receipt.confirmations >= this.REQUIRED_CONFIRMATIONS) {
          this.logger.log(
            `Transaction ${txHash} reached ${receipt.confirmations} confirmations`,
          );
          await this.finalizeTransaction(txHash);
          this.stopTrackingTransaction(txHash);
          return;
        }

        this.logger.debug(
          `Transaction ${txHash} has ${receipt.confirmations}/${this.REQUIRED_CONFIRMATIONS} confirmations`,
        );
      } catch (error) {
        this.logger.error(`Error tracking transaction ${txHash}:`, error);
      }
    }, this.POLL_INTERVAL_MS);

    this.activeTrackers.set(txHash, checkStatus);
  }

  /**
   * Stop tracking a transaction
   */
  stopTrackingTransaction(txHash: string): void {
    const tracker = this.activeTrackers.get(txHash);
    if (tracker) {
      clearInterval(tracker);
      this.activeTrackers.delete(txHash);
    }
  }

  /**
   * Mark a transaction as finalized (sufficient confirmations reached)
   * Updates the transaction status to SUCCESS
   */
  private async finalizeTransaction(txHash: string): Promise<void> {
    try {
      // Find transaction by txHash in metadata
      const transaction = await this.txRepo.findOne({
        where: {
          metadata: {
            txHash,
          },
        },
      } as any);

      if (!transaction) {
        this.logger.warn(`Transaction with hash ${txHash} not found in database`);
        return;
      }

      // Get final status from blockchain
      const finalStatus = await this.blockchain.getTransactionStatus(txHash);
      const statusToSet = finalStatus || 'SUCCESS';

      await this.txRepo.update(transaction.id, {
        status: statusToSet,
      });

      this.logger.log(
        `Transaction ${transaction.id} finalized with status ${statusToSet}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to finalize transaction with hash ${txHash}:`,
        error,
      );
    }
  }

  /**
   * Mark a transaction as orphaned (chain reorg detected or becomes invalid)
   * Updates the transaction status to FAILED
   */
  private async markAsOrphaned(txHash: string): Promise<void> {
    try {
      // Find transaction by txHash in metadata
      const transaction = await this.txRepo.findOne({
        where: {
          metadata: {
            txHash,
          },
        },
      } as any);

      if (!transaction) {
        this.logger.warn(
          `Orphaned transaction with hash ${txHash} not found in database`,
        );
        return;
      }

      // Mark as failed due to chain reorg
      await this.txRepo.update(transaction.id, {
        status: 'FAILED',
      });

      this.logger.log(
        `Transaction ${transaction.id} marked as orphaned due to chain reorg`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to mark transaction ${txHash} as orphaned:`,
        error,
      );
    }
  }

  /**
   * Cleanup: Stop all active trackers (e.g., on module shutdown)
   */
  onModuleDestroy(): void {
    for (const [txHash, tracker] of this.activeTrackers.entries()) {
      clearInterval(tracker);
      this.logger.log(`Stopped tracking transaction ${txHash}`);
    }
    this.activeTrackers.clear();
  }
}