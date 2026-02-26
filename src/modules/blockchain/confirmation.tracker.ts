// src/modules/blockchain/confirmation.tracker.ts
import { Injectable } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';

@Injectable()
export class ConfirmationTracker {
  private readonly REQUIRED_CONFIRMATIONS = 12; // Example for safety

  constructor(private blockchain: BlockchainService) {}

  async trackTransaction(txHash: string) {
    const checkStatus = setInterval(async () => {
      const receipt = await this.blockchain.getTransactionReceipt(txHash);
      const currentBlock = await this.blockchain.getCurrentBlock();
      
      const depth = currentBlock - receipt.blockNumber;

      if (depth >= this.REQUIRED_CONFIRMATIONS) {
        await this.finalizeTransaction(txHash);
        clearInterval(checkStatus);
      }
      
      // Handle Reorg: If receipt.blockNumber is no longer in the main chain
      if (!receipt.isValid) {
        await this.markAsOrphaned(txHash);
        clearInterval(checkStatus);
      }
    }, 15000); // Poll every 15 seconds
  }
}