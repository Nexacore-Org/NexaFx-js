import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import {
  isValidStellarAccountId,
  MAX_MEMO_ID,
  MAX_TEXT_MEMO_BYTES,
  MEMO_HASH_HEX_LENGTH,
} from './stellar-address.util';

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
    if (
      this.network === 'PUBLIC' &&
      this.config.get<string>('NODE_ENV') !== 'production'
    ) {
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

  /**
   * Whether the account exists on Horizon.
   *
   * The address is validated (StrKey checksum) *before* any HTTP call or cache
   * write, so a value like `../ledgers/1` or `GABC?x=` can neither traverse
   * Horizon's path, poison the cache key, nor cost a useless network round-trip
   * (#1440). The path segment is URI-encoded as defence in depth.
   *
   * An invalid address is a caller error → `BadRequestException` (400).
   */
  async accountExists(address: string): Promise<boolean> {
    if (!isValidStellarAccountId(address)) {
      throw new BadRequestException(
        `Invalid Stellar account id: ${String(address)}`,
      );
    }

    const cacheKey = `stellar:account-exists:${address}`;
    const cached = await this.cacheManager.get<boolean>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      await axios.get(
        `${this.horizonUrl}/accounts/${encodeURIComponent(address)}`,
        {
          timeout: this.timeoutMs,
        },
      );
      await this.cacheManager.set(cacheKey, true, 60_000);
      return true;
    } catch {
      await this.cacheManager.set(cacheKey, false, 60_000);
      return false;
    }
  }

  /**
   * Validate a Stellar memo (#1440).
   *
   * - `text`: length is measured in UTF-8 *bytes* (multi-byte characters count
   *   for more than one), capped at 28.
   * - `id`: must be an integer string within `0 .. 2^64-1` (checked with
   *   `BigInt`, so values above `Number.MAX_SAFE_INTEGER` are handled exactly).
   * - `hash`: must be exactly 64 hex characters (32 bytes).
   *
   * Invalid input throws `BadRequestException` (400) rather than a bare `Error`
   * (500).
   */
  validateAndFormatMemo(
    memoType: 'text' | 'id' | 'hash',
    memoValue: string,
  ): { type: string; value: string; valid: boolean } {
    if (!memoType || !memoValue) {
      return { type: memoType, value: memoValue, valid: false };
    }

    if (memoType === 'text') {
      if (Buffer.byteLength(memoValue, 'utf8') > MAX_TEXT_MEMO_BYTES) {
        throw new BadRequestException(
          `Stellar text memo cannot exceed ${MAX_TEXT_MEMO_BYTES} bytes`,
        );
      }
    } else if (memoType === 'id') {
      if (!/^\d+$/.test(memoValue)) {
        throw new BadRequestException(
          'Stellar ID memo must be a valid numeric ID',
        );
      }
      let value: bigint;
      try {
        value = BigInt(memoValue);
      } catch {
        throw new BadRequestException(
          'Stellar ID memo must be a valid numeric ID',
        );
      }
      if (value < 0n || value > MAX_MEMO_ID) {
        throw new BadRequestException(
          'Stellar ID memo must be between 0 and 2^64-1',
        );
      }
    } else if (memoType === 'hash') {
      if (
        memoValue.length !== MEMO_HASH_HEX_LENGTH ||
        !/^[0-9a-fA-F]+$/.test(memoValue)
      ) {
        throw new BadRequestException(
          'Stellar hash memo must be exactly 64 hexadecimal characters (32 bytes)',
        );
      }
    }

    return { type: memoType, value: memoValue, valid: true };
  }

  async mintReceiptNft(
    transactionId: string,
    metadata: Record<string, unknown> = {},
  ) {
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

  async executeSep31Payment(params: {
    amount: string;
    assetCode: string;
    senderId: string;
    receiverId: string;
    anchorDomain: string;
  }) {
    this.logger.log(
      `Executing SEP-31 payment for ${params.amount} ${params.assetCode} via ${params.anchorDomain}`,
    );
    return {
      status: 'pending_receiver',
      transactionId: `SEP31-${Date.now()}`,
      anchorDomain: params.anchorDomain,
      amount: params.amount,
      assetCode: params.assetCode,
      senderId: params.senderId,
      receiverId: params.receiverId,
    };
  }
}
