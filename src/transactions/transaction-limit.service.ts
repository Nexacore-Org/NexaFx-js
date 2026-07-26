import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ExchangeRateService } from '../fx/exchange-rate.service';

/** Daily limit in USD equivalent (configurable via env). */
const DAILY_LIMIT_USD = parseFloat(process.env.DAILY_LIMIT_USD ?? '50000');
const MONTHLY_LIMIT_USD = parseFloat(process.env.MONTHLY_LIMIT_USD ?? '500000');

/** In-memory accumulators keyed by `userId:YYYY-MM-DD` and `userId:YYYY-MM`. */
const dailyTotals = new Map<string, number>();
const monthlyTotals = new Map<string, number>();

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

    const today = this.dateKey();
    const month = this.monthKey();
    const dayKey = `${userId}:${today}`;
    const monKey = `${userId}:${month}`;

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
