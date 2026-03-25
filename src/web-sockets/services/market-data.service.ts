import { Injectable } from '@nestjs/common';
import { FxAggregatorService } from '../../modules/fx/fx-aggregator.service';
import { OrderBookService } from '../../modules/fx/services/order-book.service';
import {
  DEFAULT_MIN_INTERVAL_MS,
  DEFAULT_PRICE_FEED_INTERVAL_MS,
} from '../market-feed.constants';

export interface PriceFeedSubscription {
  socketId: string;
  pair: string;
  intervalMs: number;
  minIntervalMs: number;
  lastSentAt?: number;
}

@Injectable()
export class MarketDataService {
  private readonly priceSubscriptions = new Map<string, PriceFeedSubscription>();

  constructor(
    private readonly fxAggregatorService: FxAggregatorService,
    private readonly orderBookService: OrderBookService,
  ) {}

  upsertPriceSubscription(input: {
    socketId: string;
    pair: string;
    intervalMs?: number;
    minIntervalMs?: number;
  }): PriceFeedSubscription {
    const key = this.priceKey(input.socketId, input.pair);
    const subscription: PriceFeedSubscription = {
      socketId: input.socketId,
      pair: input.pair.toUpperCase(),
      intervalMs: input.intervalMs ?? DEFAULT_PRICE_FEED_INTERVAL_MS,
      minIntervalMs: input.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      lastSentAt: this.priceSubscriptions.get(key)?.lastSentAt,
    };
    this.priceSubscriptions.set(key, subscription);
    return subscription;
  }

  removePriceSubscriptions(socketId: string, pairs?: string[]): void {
    const normalizedPairs = pairs?.map((pair) => pair.toUpperCase());
    for (const [key, subscription] of this.priceSubscriptions.entries()) {
      if (subscription.socketId !== socketId) {
        continue;
      }
      if (normalizedPairs && !normalizedPairs.includes(subscription.pair)) {
        continue;
      }
      this.priceSubscriptions.delete(key);
    }
  }

  removeAllSocketSubscriptions(socketId: string): void {
    this.removePriceSubscriptions(socketId);
  }

  clearAllSubscriptions(): void {
    this.priceSubscriptions.clear();
  }

  getSubscribedPairs(): string[] {
    return [...new Set([...this.priceSubscriptions.values()].map((subscription) => subscription.pair))];
  }

  getSubscribersForPair(pair: string): PriceFeedSubscription[] {
    const normalizedPair = pair.toUpperCase();
    return [...this.priceSubscriptions.values()].filter(
      (subscription) => subscription.pair === normalizedPair,
    );
  }

  markPriceSent(socketId: string, pair: string, sentAt = Date.now()): void {
    const key = this.priceKey(socketId, pair);
    const existing = this.priceSubscriptions.get(key);
    if (!existing) {
      return;
    }
    existing.lastSentAt = sentAt;
    this.priceSubscriptions.set(key, existing);
  }

  shouldSend(subscription: PriceFeedSubscription, now = Date.now()): boolean {
    if (!subscription.lastSentAt) {
      return true;
    }

    const elapsed = now - subscription.lastSentAt;
    return elapsed >= Math.max(subscription.intervalMs, subscription.minIntervalMs);
  }

  async buildPriceMessage(pair: string) {
    const rate = await this.fxAggregatorService.getValidatedRate(pair);
    const orderBook = this.orderBookService.generateDepth(pair, rate);

    return {
      pair,
      rate,
      timestamp: new Date().toISOString(),
      orderBook,
    };
  }

  getSubscriptionCount(): number {
    return this.priceSubscriptions.size;
  }

  private priceKey(socketId: string, pair: string): string {
    return `${socketId}:${pair.toUpperCase()}`;
  }
}
