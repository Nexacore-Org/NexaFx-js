import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CurrencyPairExposure {
  currencyPair: string;     // e.g. "USD/NGN"
  totalNotional: number;    // sum of all active contract notionals (base currency)
  contractCount: number;
  lastUpdatedAt: Date;
}

@Injectable()
export class ExposureService {
  private readonly logger = new Logger(ExposureService.name);

  /**
   * In-memory exposure ledger keyed by "BASE/QUOTE".
   * In production this should be persisted in Redis or a DB table
   * so exposure survives restarts.  The interface is designed so that
   * swapping the storage layer requires only changing the four private
   * helpers below.
   */
  private readonly exposureMap = new Map<string, CurrencyPairExposure>();

  /** Configurable via env RISK_THRESHOLD (default: 1_000_000) */
  private readonly riskThreshold: number;

  constructor(private readonly configService: ConfigService) {
    this.riskThreshold = Number(
      this.configService.get<string>('RISK_THRESHOLD') ?? '1000000',
    );
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Increment exposure when a forward contract is booked.
   * @param baseCurrency  e.g. "USD"
   * @param quoteCurrency e.g. "NGN"
   * @param notionalAmount amount in base currency
   */
  addExposure(
    baseCurrency: string,
    quoteCurrency: string,
    notionalAmount: number,
  ): void {
    const key = this.pairKey(baseCurrency, quoteCurrency);
    const current = this.getOrCreate(key);
    current.totalNotional += notionalAmount;
    current.contractCount += 1;
    current.lastUpdatedAt = new Date();
    this.exposureMap.set(key, current);

    this.logger.log(
      `[ExposureService] ADD ${key}: +${notionalAmount} → total ${current.totalNotional}`,
    );

    this.checkThreshold(key, current);
  }

  /**
   * Decrement exposure when a contract is settled or cancelled.
   */
  removeExposure(
    baseCurrency: string,
    quoteCurrency: string,
    notionalAmount: number,
  ): void {
    const key = this.pairKey(baseCurrency, quoteCurrency);
    const current = this.exposureMap.get(key);
    if (!current) return;

    current.totalNotional = Math.max(0, current.totalNotional - notionalAmount);
    current.contractCount = Math.max(0, current.contractCount - 1);
    current.lastUpdatedAt = new Date();
    this.exposureMap.set(key, current);

    this.logger.log(
      `[ExposureService] REMOVE ${key}: -${notionalAmount} → total ${current.totalNotional}`,
    );
  }

  /** Returns a snapshot of all tracked exposures */
  getAllExposures(): CurrencyPairExposure[] {
    return Array.from(this.exposureMap.values());
  }

  /** Returns exposure for a specific pair, or null if none */
  getExposure(
    baseCurrency: string,
    quoteCurrency: string,
  ): CurrencyPairExposure | null {
    return this.exposureMap.get(this.pairKey(baseCurrency, quoteCurrency)) ?? null;
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  private pairKey(base: string, quote: string): string {
    return `${base.toUpperCase()}/${quote.toUpperCase()}`;
  }

  private getOrCreate(key: string): CurrencyPairExposure {
    if (!this.exposureMap.has(key)) {
      const [base, quote] = key.split('/');
      this.exposureMap.set(key, {
        currencyPair: key,
        totalNotional: 0,
        contractCount: 0,
        lastUpdatedAt: new Date(),
      });
    }
    return this.exposureMap.get(key)!;
  }

  /**
   * Fires a WARN-level alert when aggregate notional exceeds the threshold.
   * In production, plug in your alerting transport here (PagerDuty, Slack, etc.).
   */
  private checkThreshold(key: string, exposure: CurrencyPairExposure): void {
    if (exposure.totalNotional > this.riskThreshold) {
      this.logger.warn(
        `[RISK ALERT] Forward exposure for ${key} has exceeded the configured ` +
          `RISK_THRESHOLD of ${this.riskThreshold}. ` +
          `Current exposure: ${exposure.totalNotional} across ${exposure.contractCount} contract(s).`,
      );
      // TODO: dispatch AlertEvent / push to AlertsService
    }
  }
}
