import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as CircuitBreaker from 'opossum';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly rpcUrl: string;
  private readonly requiredConfirmations: number;
  private readonly breaker: CircuitBreaker;

  constructor(private readonly config: ConfigService) {
    this.rpcUrl = this.config.get<string>('BLOCKCHAIN_RPC_URL', 'http://localhost:8545');
    this.requiredConfirmations = this.config.get<number>('BLOCKCHAIN_REQUIRED_CONFIRMATIONS', 12);

    this.breaker = new CircuitBreaker(
      async (method: string, params: unknown[]) => {
        const { data } = await axios.post(this.rpcUrl, {
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        });
        if (data.error) throw new Error(`RPC error: ${data.error.message}`);
        return data.result;
      },
      {
        errorThresholdPercentage: 100,
        volumeThreshold: 5,
        timeout: 10000,
        resetTimeout: 30000,
      },
    );

    this.breaker.on('open', () =>
      this.logger.warn('Blockchain circuit breaker opened — Horizon unavailable'),
    );
    this.breaker.on('halfOpen', () =>
      this.logger.log('Blockchain circuit breaker half-open — testing recovery'),
    );
    this.breaker.on('close', () =>
      this.logger.log('Blockchain circuit breaker closed — Horizon recovered'),
    );
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    if (this.breaker.opened) {
      throw new ServiceUnavailableException('Blockchain service temporarily unavailable');
    }
    return this.breaker.fire(method, params);
  }

  async getBalance(address: string): Promise<string> {
    const hex = await this.rpc('eth_getBalance', [address, 'latest']) as string;
    return (BigInt(hex) / BigInt(1e18)).toString();
  }

  async watchTransaction(txHash: string): Promise<boolean> {
    const receipt = await this.rpc('eth_getTransactionReceipt', [txHash]) as { blockNumber: string } | null;
    if (!receipt) return false;
    const latest = await this.rpc('eth_blockNumber', []) as string;
    const confirmations = Number(BigInt(latest) - BigInt(receipt.blockNumber));
    return confirmations >= this.requiredConfirmations;
  }

  validateAddress(address: string): boolean {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  }

  getCircuitState(): { state: string; stats: object } {
    const state = this.breaker.opened
      ? 'open'
      : this.breaker.halfOpen
        ? 'half-open'
        : 'closed';
    return { state, stats: this.breaker.stats };
  }
}
