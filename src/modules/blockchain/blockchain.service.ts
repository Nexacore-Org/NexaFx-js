import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IBlockchainService } from './interfaces/blockchain.interface';

/**
 * BlockchainService
 *
 * Provides abstracted access to blockchain network via RPC endpoints.
 * Supports multiple networks configured via environment variables.
 * Methods are interface-compliant for easy mocking in tests.
 */
@Injectable()
export class BlockchainService implements IBlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly rpcUrl: string;
  private readonly requiredConfirmations: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    // Read blockchain RPC endpoint and confirmation count from config
    // Example env vars: BLOCKCHAIN_RPC_URL, BLOCKCHAIN_REQUIRED_CONFIRMATIONS
    this.rpcUrl =
      this.configService.get<string>('BLOCKCHAIN_RPC_URL') ||
      'http://localhost:8545'; // Default to localhost Ethereum node
    this.requiredConfirmations =
      this.configService.get<number>('BLOCKCHAIN_REQUIRED_CONFIRMATIONS') || 12;

    if (!this.rpcUrl) {
      this.logger.warn(
        'BLOCKCHAIN_RPC_URL not configured. Blockchain checks will fail.',
      );
    }
  }

  /**
   * Get transaction receipt from the blockchain via RPC call
   * Uses eth_getTransactionReceipt JSON-RPC method
   */
  async getTransactionReceipt(
    txHash: string,
  ): Promise<{ blockNumber: number; isValid: boolean; confirmations: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.rpcUrl, {
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      );

      const result = response.data.result;

      if (!result) {
        this.logger.debug(
          `Transaction ${txHash} not found or still pending`,
        );
        return {
          blockNumber: 0,
          isValid: false,
          confirmations: 0,
        };
      }

      // Get current block to calculate confirmations
      const currentBlockNum = await this.getCurrentBlock();
      const txBlockNum = parseInt(result.blockNumber, 16);
      const confirmations = Math.max(0, currentBlockNum - txBlockNum);

      return {
        blockNumber: txBlockNum,
        isValid: true,
        confirmations,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get transaction receipt for ${txHash}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get the current block number from the blockchain
   * Uses eth_blockNumber JSON-RPC method
   */
  async getCurrentBlock(): Promise<number> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(this.rpcUrl, {
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      );

      const blockHex = response.data.result;
      return parseInt(blockHex, 16);
    } catch (error) {
      this.logger.error('Failed to get current block number:', error);
      throw error;
    }
  }

  /**
   * Get the status of a transaction from the blockchain
   * - Returns 'SUCCESS' if the transaction was mined successfully
   * - Returns 'FAILED' if the transaction was mined but reverted
   * - Returns null if the transaction is pending or not found
   */
  async getTransactionStatus(txHash: string): Promise<string | null> {
    try {
      const receipt = await this.getTransactionReceipt(txHash);

      if (!receipt.isValid) {
        // Transaction not yet mined
        return null;
      }

      // Check the status field: 0x0 = failed, 0x1 = success
      const response = await firstValueFrom(
        this.httpService.post(this.rpcUrl, {
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      );

      const result = response.data.result;
      if (!result || !result.status) {
        return null;
      }

      const statusHex = result.status;
      return statusHex === '0x1' ? 'SUCCESS' : 'FAILED';
    } catch (error) {
      this.logger.error(
        `Failed to get transaction status for ${txHash}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Verify if a transaction has sufficient confirmations
   * Used by ConfirmationTracker to determine finalization
   */
  async hasRequiredConfirmations(txHash: string): Promise<boolean> {
    try {
      const receipt = await this.getTransactionReceipt(txHash);
      return receipt.confirmations >= this.requiredConfirmations;
    } catch (error) {
      this.logger.error(
        `Failed to check confirmations for ${txHash}:`,
        error,
      );
      return false;
    }
  }
}
