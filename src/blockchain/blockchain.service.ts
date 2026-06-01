import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private readonly rpcUrl: string;
  private readonly requiredConfirmations: number;

  constructor(private readonly config: ConfigService) {
    this.rpcUrl = this.config.get<string>('BLOCKCHAIN_RPC_URL', 'http://localhost:8545');
    this.requiredConfirmations = this.config.get<number>('BLOCKCHAIN_REQUIRED_CONFIRMATIONS', 12);
  }

  private async rpc(method: string, params: unknown[]): Promise<unknown> {
    const { data } = await axios.post(this.rpcUrl, { jsonrpc: '2.0', id: 1, method, params });
    if (data.error) throw new Error(`RPC error: ${data.error.message}`);
    return data.result;
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
}
