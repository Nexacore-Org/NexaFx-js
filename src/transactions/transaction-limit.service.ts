import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ExchangeRateService } from '../fx/exchange-rate.service';

/** Daily limit in USD equivalent (configurable via env). */
const DAILY_LIMIT_USD = parseFloat(process.env.DAILY_LIMIT_USD ?? '50000');
const MONTHLY_LIMIT_USD = parseFloat(process.env.MONTHLY_LIMIT_USD ?? '500000');
const SINGLE_TX_LIMIT_USD = parseFloat(process.env.SINGLE_TX_LIMIT_USD ?? '25000');

/** In-memory accumulators keyed by `userId:YYYY-MM-DD` and `userId:YYYY-MM`. */
const dailyTotals = new Map<string, number>();
const monthlyTotals = new Map<string, number>();

/** Per-user lock chain so check-and-increment is atomic within this instance. */
const userLocks = new Map<string, Promise<unknown>>();

@Injectable()
export class TransactionLimitService {
  private readonly logger = new Logger(TransactionLimitService.name);

  constructor(private readonly exchangeRate: ExchangeRateService) {}

  /**
   * Convert `amount` in `currency` to USD using the cached rate, then check
   * daily and monthly limits for `userId`. Throws if any limit is exceeded.
   */
  async check(userId: string, amount: number, currency: string): Promise<void> {
    const amountUsd = await this.toUsd(amount, currency);

    if (amountUsd > SINGLE_TX_LIMIT_USD) {
      throw new BadRequestException(
        `Transaction exceeds single-transaction USD-equivalent limit of $${SINGLE_TX_LIMIT_USD}`,
      );
    }

    // Chain onto any in-flight check for this user so the read-check-write
    // below is never interleaved with a concurrent call for the same user.
    const previous = userLocks.get(userId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.checkAndCommit(userId, amountUsd));
    userLocks.set(userId, current);
    try {
      await current;
    } finally {
      if (userLocks.get(userId) === current) userLocks.delete(userId);
    }
  }

  private checkAndCommit(userId: string, amountUsd: number): void {
    const dayKey = `${userId}:${this.dateKey()}`;
    const monKey = `${userId}:${this.monthKey()}`;

    const dayTotal = (dailyTotals.get(dayKey) ?? 0) + amountUsd;
    const monTotal = (monthlyTotals.get(monKey) ?? 0) + amountUsd;

    if (dayTotal > DAILY_LIMIT_USD) {
      throw new BadRequestException(
        `Transaction would exceed daily USD-equivalent limit of $${DAILY_LIMIT_USD}`,
      );
    }
    if (monTotal > MONTHLY_LIMIT_USD) {
      throw new BadRequestException(
        `Transaction would exceed monthly USD-equivalent limit of $${MONTHLY_LIMIT_USD}`,
      );
    }

    // Commit accumulators only after both checks pass.
    dailyTotals.set(dayKey, dayTotal);
    monthlyTotals.set(monKey, monTotal);

    this.logger.debug(
      `Limit check passed for ${userId}: $${amountUsd.toFixed(2)} USD (day=$${dayTotal.toFixed(2)}, month=$${monTotal.toFixed(2)})`,
    );
  }

  private async toUsd(amount: number, currency: string): Promise<number> {
    if (currency.toUpperCase() === 'USD') return amount;
    const { rate } = await this.exchangeRate.getRate(currency, 'USD');
    return amount * rate;
  }

  private dateKey(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private monthKey(): string {
    return new Date().toISOString().slice(0, 7); // YYYY-MM
  }

  /** For testing — reset accumulators. */
  resetAccumulators(): void {
    dailyTotals.clear();
    monthlyTotals.clear();
  }
}
