import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';

@Injectable()
export class StellarService implements OnModuleInit {
  private readonly logger = new Logger(StellarService.name);
  private readonly horizonUrl: string;
  private readonly network: string;
  private readonly timeoutMs = 5000;
  private feeCache: { p70Fee: number; cachedAt: number } | null = null;
  private readonly feeCacheTtlMs = 10_000;

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.horizonUrl = this.config.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    this.network = this.config
      .get<string>('STELLAR_NETWORK', 'TESTNET')
      .toUpperCase();
  }

  async onModuleInit(): Promise<void> {
    if (this.network === 'PUBLIC' && this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.error(
        '[STARTUP BLOCKED] STELLAR_NETWORK=PUBLIC is forbidden when NODE_ENV is not "production"',
      );
      throw new Error(
        '[STARTUP BLOCKED] STELLAR_NETWORK=PUBLIC is only allowed in production environments.',
      );
    }

    this.logger.log(
      `[CRITICAL] Stellar network: ${this.network}${this.network === 'PUBLIC' ? ' — REAL MONEY TRANSACTIONS ENABLED' : ''}`,
    );

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

  async accountExists(address: string): Promise<boolean> {
    const cacheKey = `stellar:account-exists:${address}`;
    const cached = await this.cacheManager.get<boolean>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      await axios.get(`${this.horizonUrl}/accounts/${address}`, {
        timeout: this.timeoutMs,
      });
      await this.cacheManager.set(cacheKey, true, 60_000);
      return true;
    } catch {
      await this.cacheManager.set(cacheKey, false, 60_000);
      return false;
    }
  }

  validateAndFormatMemo(memoType: 'text' | 'id' | 'hash', memoValue: string): { type: string; value: string; valid: boolean } {
    if (!memoType || !memoValue) {
      return { type: memoType, value: memoValue, valid: false };
    }
    if (memoType === 'text' && memoValue.length > 28) {
      throw new Error('Stellar text memo cannot exceed 28 bytes');
    }
    if (memoType === 'id' && !/^\d+$/.test(memoValue)) {
      throw new Error('Stellar ID memo must be a valid numeric ID');
    }
    return { type: memoType, value: memoValue, valid: true };
  }

  async mintReceiptNft(transactionId: string, metadata: Record<string, unknown> = {}) {
    const nftId = `NFT-REC-${transactionId}-${Date.now().toString().slice(-6)}`;
    return {
      transactionId,
      nftId,
      stellarAssetCode: `REC${transactionId.slice(0, 4).toUpperCase()}`,
      issuer: 'G-STELLAR-RECEIPT-ISSUER',
      metadata,
      mintedAt: new Date().toISOString(),
    };
  }
}
