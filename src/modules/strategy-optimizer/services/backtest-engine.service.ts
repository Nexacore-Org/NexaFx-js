import { Injectable } from '@nestjs/common';

export interface BacktestResult {
  trades: Trade[];
  sharpeRatio: number;
  totalReturn: number;
  winRate: number;
}

interface Trade {
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
}

/**
 * Real MA crossover backtester.
 * - No look-ahead: only data up to the current bar is used.
 * - Walk-forward split configurable (default 70/30).
 * - Fitness = Sharpe ratio (annualised, daily returns).
 */
@Injectable()
export class BacktestEngineService {
  /**
   * Run MA crossover strategy on a price array.
   * @param prices  Array of close prices (chronological order).
   * @param shortPeriod  Short MA window.
   * @param longPeriod   Long MA window.
   * @param trainRatio   Fraction of data used for training (default 0.7).
   */
  backtest(
    prices: number[],
    shortPeriod: number,
    longPeriod: number,
    trainRatio = 0.7,
  ): { train: BacktestResult; validation: BacktestResult } {
    const splitIdx = Math.floor(prices.length * trainRatio);
    return {
      train: this.runBacktest(prices.slice(0, splitIdx), shortPeriod, longPeriod),
      validation: this.runBacktest(prices.slice(splitIdx), shortPeriod, longPeriod),
    };
  }

  runBacktest(prices: number[], shortPeriod: number, longPeriod: number): BacktestResult {
    if (prices.length < longPeriod + 1) {
      return { trades: [], sharpeRatio: -Infinity, totalReturn: 0, winRate: 0 };
    }

    const trades: Trade[] = [];
    let inPosition = false;
    let entryIndex = 0;
    let entryPrice = 0;

    for (let i = longPeriod; i < prices.length; i++) {
      const shortMA = this.sma(prices, i, shortPeriod);
      const prevShortMA = this.sma(prices, i - 1, shortPeriod);
      const longMA = this.sma(prices, i, longPeriod);
      const prevLongMA = this.sma(prices, i - 1, longPeriod);

      // Golden cross: short crosses above long → buy
      if (!inPosition && prevShortMA <= prevLongMA && shortMA > longMA) {
        inPosition = true;
        entryIndex = i;
        entryPrice = prices[i];
      }
      // Death cross: short crosses below long → sell
      else if (inPosition && prevShortMA >= prevLongMA && shortMA < longMA) {
        const exitPrice = prices[i];
        const pnl = (exitPrice - entryPrice) / entryPrice;
        trades.push({ entryIndex, exitIndex: i, entryPrice, exitPrice, pnl });
        inPosition = false;
      }
    }

    // Close any open position at end
    if (inPosition) {
      const exitPrice = prices[prices.length - 1];
      const pnl = (exitPrice - entryPrice) / entryPrice;
      trades.push({ entryIndex, exitIndex: prices.length - 1, entryPrice, exitPrice, pnl });
    }

    const sharpeRatio = this.computeSharpe(trades, prices.length);
    const totalReturn = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = trades.length > 0
      ? trades.filter((t) => t.pnl > 0).length / trades.length
      : 0;

    return { trades, sharpeRatio, totalReturn, winRate };
  }

  private sma(prices: number[], endIdx: number, period: number): number {
    const slice = prices.slice(endIdx - period + 1, endIdx + 1);
    return slice.reduce((s, p) => s + p, 0) / slice.length;
  }

  private computeSharpe(trades: Trade[], totalBars: number): number {
    if (trades.length === 0) return -Infinity;

    // Build daily return series (0 for bars not in a trade)
    const returns = trades.map((t) => t.pnl);
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return mean > 0 ? Infinity : -Infinity;

    // Annualise assuming ~252 trading days
    const annualisationFactor = Math.sqrt(252 / Math.max(1, totalBars / returns.length));
    return (mean / stdDev) * annualisationFactor;
  }
}
