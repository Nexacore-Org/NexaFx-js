import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class StellarService implements OnModuleInit {
  private readonly logger = new Logger(StellarService.name);
  private readonly horizonUrl: string;
  private readonly network: string;
  private readonly timeoutMs = 5000;
  private feeCache: { p70Fee: number; cachedAt: number } | null = null;
  private readonly feeCacheTtlMs = 10_000;

  constructor(private readonly config: ConfigService) {
    this.horizonUrl = this.config.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    this.network = this.config
      .get<string>('STELLAR_NETWORK', 'TESTNET')
      .toUpperCase();
  }

  async onModuleInit(): Promise<void> {
    await this.checkHorizonHealth();
  }

  async checkHorizonHealth(): Promise<void> {
    try {
      await axios.get(this.horizonUrl, { timeout: this.timeoutMs });
      this.logger.log(
        `Stellar Horizon reachable at ${this.horizonUrl} (${this.network})`,
      );
    } catch (err) {
      const message = `Stellar Horizon unreachable at ${this.horizonUrl}: ${(err as Error).message}`;
      if (this.network === 'PUBLIC') {
        throw new Error(`[STARTUP BLOCKED] ${message}`);
      }
      this.logger.warn(`[TESTNET] ${message} — startup continues`);
    }
  }

  async getEstimatedFee(): Promise<number> {
    if (this.feeCache && Date.now() - this.feeCache.cachedAt < this.feeCacheTtlMs) {
      return this.feeCache.p70Fee;
    }

    try {
      const response = await axios.get(`${this.horizonUrl}/fee_stats`, { timeout: this.timeoutMs });
      const stats = response.data;
      const p70Fee = parseInt(stats?.fee_charged?.p70 ?? stats?.max_fee?.p70 ?? '0', 10);

      if (p70Fee > 0) {
        this.feeCache = { p70Fee, cachedAt: Date.now() };
        return p70Fee;
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch fee stats: ${(err as Error).message}`);
    }

    const baseFee = this.config.get<number>('STELLAR_BASE_FEE', 100);
    return baseFee * 10;
  }
}
